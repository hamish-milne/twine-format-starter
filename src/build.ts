/// <reference lib="es2021" />
import { build, BuildOptions, OnLoadResult, Plugin } from "esbuild";
import { pnpPlugin } from "@yarnpkg/esbuild-plugin-pnp";
import { replace } from "esbuild-plugin-replace";
import PostHTML from "posthtml";
import { NodeTag } from "posthtml-parser";
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
      build.onLoad({ filter }, () => {
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
  let text: string | null = null;
  for (const file of result.outputFiles ?? []) {
    writeFileSync(file.path, file.contents);
    if (file.path.endsWith(".js")) {
      text = file.text;
    }
  }
  if (!text) {
    throw new Error("No JS output");
  }
  return text;
}

// For posthtml-inline-assets, use 'require.resolve' to resolve the asset path.
// This allows us to use package assets, such as fontawesome.
function transform(tag: string, rel: string | null, attr: string) {
  return {
    resolve(node: NodeTag) {
      return (
        node.tag === tag &&
        node.attrs &&
        node.attrs[attr] &&
        (rel === null || node.attrs.rel === rel) &&
        require.resolve(node.attrs[attr] as string)
      );
    },
  };
}

async function buildHtml(input: string): Promise<string> {
  const result = await PostHTML([
    // We want to 'inline' any images, stylesheets and the like, because
    // a story format's player bundle must be a single HTML file.
    posthtmlInlineAssets({
      errors: "warn",
      transforms: {
        image: transform("img", null, "src"),
        script: transform("script", null, "src"),
        style: transform("link", "stylesheet", "href"),
        favicon: transform("link", "icon", "href"),
      },
    }),
    // We can disable SVG and JS minifying, since that's already done by this point.
    htmlnano({
      minifyCss: true,
      minifyJs: false,
      minifySvg: false,
      collapseWhitespace: "aggressive",
    }),
  ]).process(readFileSync(input, "utf8"));
  return result.html;
}

// The main build function.
// Since this is a multi-step process, we unfortunately can't use esbuild's watch functionality.
async function doBuild() {
  mkdirSync("build", { recursive: true });

  // The 'icon' property in a story format must be a relative path to an image file.
  // It cannot be a data URL because Twine prepends the format URL's directory to the
  // image source.
  const pkg = (await import("../package.json")).default;
  const iconExt = path.extname(pkg.icon);
  copyFileSync(require.resolve(pkg.icon), `./build/icon${iconExt}`);
  pkg.icon = `icon${iconExt}`;

  // Inject the contents of 'package.json' into the bundle.
  const packageDefines = flattenJson(pkg, "PACKAGE.", [
    "dependencies",
    "devDependencies",
    "eslintConfig",
  ]);

  async function buildEditor() {
    const hydrate_raw = await buildJs({
      ...moduleOptions(packageDefines),
      entryPoints: ["./src/editor/hydrate.ts"],
      outfile: "./build/hydrate.js",
      // This allows us to retrieve the contents of 'hydrate.ts's exports:
      globalName: "DUMMY_GLOBAL_NAME",
    });
    // NOTE: To ensure sourcemaps work correctly, these two strings should be the same length:
    return hydrate_raw.replace(
      "var DUMMY_GLOBAL_NAME",
      "this.editorExtensions"
    );
  }

  async function buildPlayer() {
    await buildJs({
      ...moduleOptions(packageDefines),
      entryPoints: ["./src/player/index.ts"],
      outfile: "./build/player.js",
    });

    return await buildHtml("./src/player/index.html");
  }

  const [hydrate, sourceHtml] = await Promise.all([
    buildEditor(),
    buildPlayer(),
  ]);

  // Build the final output:
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

  // Remove the intermediate files:
  for (const path of ["./build/player.js", "./build/hydrate.js"]) {
    unlinkSync(path);
  }
}

doBuild();
