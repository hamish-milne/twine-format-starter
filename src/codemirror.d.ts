import "codemirror";
import "codemirror/addon/mode/simple";

declare module "codemirror" {
  function simpleMode<K extends string>(
    config: EditorConfiguration,
    states: { [P in K]: P extends "meta" ? Record<string, any> : Rule[] } & {
      start: Rule[];
    }
  ): Mode<unknown>;

  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface EditorConfiguration extends CommentOptions {}
}
