import type { Editor } from "codemirror";

// For each Command, export a function named the same as the command name,
// accepting a single argument of type 'Editor'.
export function toggleComment(e: Editor) {
  e.execCommand("toggleComment");
}
