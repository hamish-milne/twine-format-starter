/// <reference lib="es2021.string" />
import "core-js/actual/string/replace-all";
const storyData = document.getElementById("storyData")!.firstElementChild!;
const passages = Array.from(storyData.children);

function load() {
  let { passage } = Object.fromEntries(
    new URLSearchParams("?" + window.location.href.split("?")[1]).entries()
  );
  if (!passage || passage == "") {
    const startId = storyData.getAttribute("startnode")!;
    passage = passages
      .find((x) => x.getAttribute("pid") === startId)!
      .getAttribute("name")!;
  }
  const passageNode = passages.find((x) => x.getAttribute("name") === passage);

  if (passageNode) {
    const root = `${window.location.href.split("?")[0]}?passage=`;
    let content = passageNode.textContent!;
    content = content.replaceAll(
      /\[\[([^-\]]+)->([^\]]+)]]/g,
      (_, label, passage) => {
        return `<a href="${root}${passage}">${label}</a>`;
      }
    );
    content = content.replaceAll(
      /\[\[([^-\]]+)<-([^\]]+)]]/g,
      (_, passage, label) => {
        return `<a href="${root}${passage}">${label}</a>`;
      }
    );
    content = content.replaceAll(/\[\[([^\]]+)]]/g, (_, passage) => {
      return `<a href="${root}${passage}">${passage}</a>`;
    });
    content = content.replaceAll("\n\n", "</p><p>");
    content = `<p>${content}</p>`;
    document.getElementById("output")!.innerHTML = content;
  } else {
    document.getElementById(
      "output"
    )!.innerHTML = `<p>Passage "${passage}" not found</p>`;
  }
}

window.addEventListener("hashchange", load);
load();
