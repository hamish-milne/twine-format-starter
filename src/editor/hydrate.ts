import { getEditorInstances, init } from "./twine_hacks";
import toolbar from "./toolbar";
import * as commands from "./commands";
import * as references from "./references";

export const twine = {
  [PACKAGE.runtimes.twine]: {
    codeMirror: {
      mode: (...args: any[]) => {
        init();
        // NB: We *must* use 'require' here to ensure that the module doesn't get loaded
        // before we have a chance to set up the global scope.
        const setup = require("./setup");
        setup.globalSetup();
        for (const editor of getEditorInstances()) {
          setup.localSetup(editor);
        }
        const mode = require("./mode");
        return mode.default(...args);
      },
      toolbar,
      commands,
      references,
    },
  },
};
