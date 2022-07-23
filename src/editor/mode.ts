import "codemirror/addon/mode/simple";

import type { EditorConfiguration, Mode } from "codemirror";

export default function (config: EditorConfiguration): Mode<unknown> {
  // This is a simple example of a mode that highlights all the
  // supported forms of Twine passage links.
  return window.CodeMirror.simpleMode(config, {
    start: [
      {
        regex: /(\[\[)(.*?)(<-)/,
        token: ["bracket", "link", "special", "bracket"],
      },
      {
        regex: /(\[\[)((?:(?!->).)*?)(\]\])/,
        token: ["bracket", "link", "bracket"],
      },
      { regex: /\[\[/, token: "bracket" },
      { regex: /(->)(.*?)(]])/, token: ["special", "link", "bracket"] },
      { regex: /(->)/, token: "special" },
      { regex: /]]/, token: "bracket" },
    ],
  });
}
