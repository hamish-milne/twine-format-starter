/// <reference lib="es2021" />
import { build, BuildOptions, OnLoadResult, Plugin } from "esbuild";
import { pnpPlugin } from "@yarnpkg/esbuild-plugin-pnp";
import { replace } from "esbuild-plugin-replace";
import PostHTML from "posthtml";
import { NodeTag, parser } from "posthtml-parser";
import htmlnano from "htmlnano";
import {
  copyFileSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
} from "fs";
import posthtmlInlineAssets from "posthtml-inline-assets";
import postcss from "postcss";
import cssnano from "cssnano";
import path from "path";

// This is a utility plugin that mimics Webpack's 'null' loader.
// It can be used to manually exclude files from the bundle, if you know
// that they are not needed.
function nullLoader(filter: RegExp): Plugin {
  return {
    name: "nullLoader",
    setup(build) {
      build.onLoad({ filter }, (_) => {
        return {
          contents: "",
          loader: "js",
        };
      });
    },
  };
}

// This plugin is used to fix the source map URLs in the bundle.
// This is necessary because the code for 'hydrate' is executed in an 'eval'
// context, which means that the default relative paths won't work.
// Likewise, the player is executed separately, so it needs an absolute path.
// The base URL is passed in as a command line argument.
const sourceMapPrefix = process.argv[2]?.toString();
const fixSourceMapUrl: Plugin = {
  name: "fixSourceMapUrl",
  setup(build) {
    build.onEnd((result) => {
      if (!sourceMapPrefix) {
        return;
      }
      result.outputFiles = result.outputFiles?.map((file) => {
        if (file.path.endsWith(".js")) {
          const newText = file.text.replaceAll(
            /^(\/\/# sourceMappingURL=)(.*)$/gm,
            (_, p1, p2) => {
              if (!p2.startsWith(sourceMapPrefix)) {
                return `${p1}${sourceMapPrefix}${p2}`;
              } else {
                return `${p1}${p2}`;
              }
            }
          );
          return {
            path: file.path,
            contents: Buffer.from(newText, "utf8"),
            text: newText,
          };
        } else {
          return file;
        }
      });
    });
  },
};

// This generates a flat key-value map from an arbitrary JSON object.
// This allows unused fields to be removed from the bundle.
function flattenJson(
  obj: object,
  prefix: string,
  excludeKeys: string[]
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (excludeKeys.includes(key)) {
      continue;
    }
    if (typeof value === "object") {
      Object.assign(
        result,
        flattenJson(value, `${prefix}${key}.`, excludeKeys)
      );
    } else {
      result[`${prefix}${key}`] = JSON.stringify(value);
    }
  }
  return result;
}

// Options applied to all JS builds
const common: BuildOptions = {
  // Makes the bundle smaller. Turn it off if you want to inspect the generated code.
  minify: true,
  // We should support the same browsers as Twine 2.4, plus Chrome 66 which is used by
  // the Twine 2.3 desktop app.
  // This the result of running `yarn dlx browserslist ">0.2%, not dead, not op_mini all, chrome 66"`
  // with options unsupported by esbuild removed (NB, it should still work fine on those browsers).
  target: ["chrome66", "edge101", "firefox100", "ios12.2", "safari13.1"],
  // Write the sourcemaps to a separate file, so that they can be loaded separately.
  sourcemap: "linked",
  // Return the JS as a string, so we can interpolate it into other files.
  write: false,
};

const removeUseStrict = {
  '"use strict"': "",
  "'use strict'": "",
};

function moduleOptions(defines: Record<string, string>): BuildOptions {
  return {
    ...common,
    plugins: [
      // Force CodeMirror modes to use the 'plain browser env', rather than
      //   importing a new CodeMirror instance.
      replace({
        include: /codemirror.*\.js$/,
        delimiters: ["", ""],
        'typeof exports == "object"': "false",
        'typeof define == "function"': "false",
        'typeof module == "object"': "false",
        "define.amd": "false",
        ...removeUseStrict,
      }),

      // Remove all 'use strict' statements from the code, and add it at the top level with 'banner'.
      replace({
        include: /\.js$/,
        delimiters: ["", ""],
        ...removeUseStrict,
      }),

      // Use Yarn PnP to resolve module imports.
      // For CSS files, apply the CSSNano minifier.
      pnpPlugin({
        async onLoad(args) {
          const contents = readFileSync(args.path);
          const result: OnLoadResult = {
            contents: contents,
            loader: "default",
            resolveDir: path.dirname(args.path),
          };
          if (args.path.endsWith(".css")) {
            result.contents = Buffer.from(
              (
                await postcss([cssnano()]).process(contents, {
                  from: args.path,
                })
              ).css,
              "utf8"
            );
          }
          return result;
        },
      }),

      fixSourceMapUrl,
    ],

    // This setting effectively excludes the given modules from the bundle.
    // If an import is attempted at runtime, it would generate an error, however
    // for the below cases, we can be confident that the code path will never be
    // executed (in fact, it gets stripped out by the minifier).
    external: ["../../lib/codemirror", "../meta", "../xml/xml"],

    // We use the 'iife' format, since the bundle is intended to be executed
    // at the top level by the browser.
    format: "iife",
    bundle: true,
    define: defines,

    // This specifies how files will be loaded. For CSS files, we want the plain
    // text contents so we can inject them into the page at runtime.
    // For images, we want a data URL, since that's what Twine 2.4 expects for icons.
    loader: {
      ".css": "text",
      ".svg": "dataurl",
      ".png": "dataurl",
    },

    // Make sure the whole file runs in 'strict mode'.
    banner: {
      js: '"use strict";',
    },
  };
}

// Wraps around esbuild, writing the output files to disk and returning the
// resulting bundle.
async function buildJs(options: BuildOptions): Promise<string> {
  const result = await build(options);
  let text: string;
  for (const file of result.outputFiles ?? []) {
    writeFileSync(file.path, file.contents);
    if (file.path.endsWith(".js")) {
      text = file.text;
    }
  }
  return text!;
}

async function buildHtml(input: string): Promise<string> {
  const result = await PostHTML([
    // We want to 'inline' any images, stylesheets and the like, because
    // a story format's player bundle must be a single HTML file.
    posthtmlInlineAssets({
      errors: "warn",
      transforms: {
        image: {
          resolve(node: NodeTag) {
            return (
              node.tag === "img" &&
              node.attrs &&
              node.attrs.src &&
              require.resolve(node.attrs.src as string)
            );
          },
          transform(
            node: NodeTag,
            args: { from: string; buffer: Buffer; mime: string }
          ) {
            if (!node.attrs) {
              return;
            }
            if (args.from.toLowerCase().endsWith(".svg")) {
              const svgRoot = parser(
                args.buffer.toString("utf8")
              )[0] as NodeTag;
              node.tag = "svg";
              Object.assign(node.attrs, svgRoot.attrs);
              delete node.attrs.src;
              node.content = svgRoot.content as any[];
            } else {
              node.attrs.src = `data:${args.mime};base64,${args.buffer.toString(
                "base64"
              )}`;
            }
          },
        },
      },
    }),
    htmlnano({
      minifyCss: true,
      minifyJs: false,
      minifySvg: false,
      collapseWhitespace: "aggressive",
    }),
  ]).process(readFileSync(input, "utf8"));
  return result.html;
}

async function doBuild() {
  mkdirSync("build", { recursive: true });
  const pkg = (await import("../package.json")).default;
  const iconExt = path.extname(pkg.icon);
  copyFileSync(require.resolve(pkg.icon), `./build/icon${iconExt}`);
  pkg.icon = `icon${iconExt}`;
  const packageDefines = flattenJson(pkg, "PACKAGE.", [
    "dependencies",
    "devDependencies",
  ]);
  const hydrate_raw = await buildJs({
    ...moduleOptions(packageDefines),
    entryPoints: ["./src/editor/hydrate.ts"],
    outfile: "./build/hydrate.js",
    globalName: "DUMMY_GLOBAL_NAME",
  });
  // NOTE: To ensure sourcemaps work correctly, these two strings should be the same length:
  const hydrate = hydrate_raw.replace(
    "var DUMMY_GLOBAL_NAME",
    "this.editorExtensions"
  );
  await buildJs({
    ...moduleOptions(packageDefines),
    entryPoints: ["./src/player/index.ts"],
    outfile: "./build/player.js",
  });
  const sourceHtml = await buildHtml("./src/player/index.html");
  await buildJs({
    ...common,
    define: {
      ...packageDefines,
      HYDRATE: JSON.stringify(hydrate),
      SOURCE: JSON.stringify(sourceHtml),
    },
    entryPoints: ["./src/format.ts"],
    outfile: "./build/format.js",
    sourcemap: false,
  });
  for (const path of ["./build/player.js", "./build/hydrate.js"]) {
    unlinkSync(path);
  }
}

doBuild();
