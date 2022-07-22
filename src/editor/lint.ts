import { Linter } from "codemirror/addon/lint/lint";

const linter: Linter<unknown> = async (content, options, editor) => {
  // Given a passage, return an array of linting Annotations:
  return [];
};

export default linter;
