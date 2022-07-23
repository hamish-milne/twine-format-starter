import "codemirror/addon/lint/lint";
import "codemirror/addon/comment/comment";
import { getNamespace } from "./twine_hacks";

import lintCss from "codemirror/addon/lint/lint.css";
import editorCss from "./editor.css";
import type { Editor } from "codemirror";
import linter from "./lint";

function loadExtraCss(id: string, src: string) {
  let styleContainer = document.querySelector(`style#${id}`);
  if (!styleContainer) {
    styleContainer = document.createElement("style");
    styleContainer.setAttribute("id", id);
    document.head.appendChild(styleContainer);
  }
  styleContainer.innerHTML = src;
}

export function globalSetup() {
  loadExtraCss("cm-lint", lintCss);
  loadExtraCss(`cm-${PACKAGE.name}`, editorCss);
  window.CodeMirror.registerHelper("lint", getNamespace(), linter);
}

export function localSetup(cm: Editor) {
  // NB: You can configure any options you like in this function:
  cm.setOption("lint", true);
  cm.setOption("lineNumbers", true);
  cm.setOption("blockCommentStart", "<!--");
  cm.setOption("blockCommentEnd", "-->");
  // HACK: Force a change to get it to lint for the first time
  for (const f of (cm as any)._handlers.change) {
    f(cm);
  }
}
