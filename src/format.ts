// The following are injected by the build system:
declare const HYDRATE: string;
declare const SOURCE: string;
// eslint-disable-next-line
declare var storyFormat: (format: any) => void;
window.storyFormat({
  name: PACKAGE.title,
  version: PACKAGE.version,
  author: PACKAGE.author,
  description: PACKAGE.description,
  proofing: false,
  url: PACKAGE.repository.url,
  license: PACKAGE.license,
  image: PACKAGE.icon,
  hydrate: HYDRATE,
  source: SOURCE,
  // Legacy support for Twine <=2.3.
  // We re-use the 'hydrate' function to avoid having an extra JS bundle
  setup() {
    const out: any = {};
    new Function(this.properties.hydrate).call(out);
    window.CodeMirror.defineMode(
      PACKAGE.name,
      out.editorExtensions.twine[PACKAGE.runtimes.twine].codeMirror.mode
    );
  },
});
