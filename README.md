# twine-format-starter

This is a starter project for developing a Twine 2 story format. It is designed to be cloned and customised to fit your specific needs, while taking care of most of Twine's quirks and providing a solid framework for future extension.

Quick feature summary:

- Supports Twine 2~2.4 with the same code
- TypeScript or JavaScript, your choice
- Player HTML bundle
- CodeMirror syntax highlighting
- CodeMirror linting
- Editor extensions (toolbars, references)
- Fast builds, small bundles
- Sourcemaps
- Unit tests
- CI
- Dev server

## Building and running

`yarn` to install. If you get an error, `corepack enable`.

`yarn dev` to start a local web server that serves your format bundle, rebuilding it if it notices any changes. While it's running, you can add http://localhost:8080/format.js as a Story Format, and refresh your Twine instance to reload it when necessary.

This project makes no distinction between 'development' and 'production' builds, since esbuild is fast enough that we can build for production every time. When you want to distribute your format, just look in the 'build' folder.

## FAQ

By default, this project produces code that violates some of the principles of the [Extending Twine](https://github.com/klembot/twinejs/blob/develop/EXTENDING.md) document in the main repository; specifically the rule against modifying the global scope, relying on the mode name, potentially retrieving the list of all passages and, implicitly, relying on some of Twine's internals which are subject to change. This is intentional, as it allows us to support some more advanced functionality.

If you aren't using these features, or are concerned about forwards compatibility, or simply want to ensure that your format is maximally compliant with the specification, you can do the following:

- Remove `lint.ts`, `setup.ts`, `twine_hacks.ts`, `codemirror.d.ts`, and `editor.css`
- Rewrite `mode.ts` such that it doesn't rely on `CodeMirror.simpleMode`
- Replace `hydrate.ts` with the following:

```typescript
import mode from "./mode";
import toolbar from "./toolbar";
import * as commands from "./commands";
import * as references from "./references";

export const twine = {
  [PACKAGE.runtimes.twine]: {
    codeMirror: {
      mode,
      toolbar,
      commands,
      references,
    },
  },
};
```

Note that the following features are not possible with these constraints:

- CodeMirror linting
- Editor styling
- Custom CodeMirror tags (since they can no longer be styled)
- Line numbering (for the same reason)
- Changing CodeMirror's editor options on load (e.g. tab width)
- Using any other CodeMirror addons, such as 'mode/simple' or 'comment'

It is unclear from the specification whether the inclusion of the legacy `setup` function is a violation or not (it states that JSONP 'does not permit executable code to be encoded', which may be true legally speaking, but is certainly false in practice). If you don't care about supporting Twine <=2.3, you can simply remove it from `format.ts`.
