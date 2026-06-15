/** @babel */

import { log, INSPECTOR_URI, OUTPUT_AREA_URI, openOrShowDock } from "./utils";
import { getExpressionAtCursor } from "./code-manager";
import OutputPane from "./panes/output-area";
import inspectorStore from "./store/inspector-store";

function isInspectorFocused() {
  const element = atom.workspace.paneForURI(INSPECTOR_URI)?.element;
  return Boolean(
    element &&
      (element.offsetWidth !== 0 || element.offsetHeight !== 0) &&
      element.contains(document.activeElement),
  );
}

export async function showInspector(store, adapterServices = null) {
  if (isInspectorFocused()) {
    atom.workspace.getCenter().activate();
    return;
  }
  const item = await atom.workspace.open(INSPECTOR_URI, { searchAllPanes: true });
  setInspector(store, adapterServices);
  item?.focus?.();
}

export async function inspectUnderCursor(store, adapterServices = null) {
  await openOrShowDock(INSPECTOR_URI);
  setInspector(store, adapterServices);
}

export async function setInspector(store, adapterServices = null) {
  if (!store) {
    return;
  }
  if (
    adapterServices &&
    require("./adapter-integration").setAdapterInspector(adapterServices)
  ) {
    return;
  }
  const { editor, kernel } = store;
  if (!editor || !kernel) {
    inspectorStore.setError("No kernel running!");
    return;
  }
  const code = getExpressionAtCursor(editor);
  if (!code) {
    inspectorStore.setError("No code to introspect!");
    return;
  }
  log("Inspector: Inspecting:", code);
  inspectorStore.load(kernel, code);
}

export function toggleOutputMode() {
  // There should never be more than one instance of OutputArea
  const outputArea = atom.workspace
    .getPaneItems()
    .find((paneItem) => paneItem instanceof OutputPane);
  if (outputArea) {
    return outputArea.destroy();
  } else {
    openOrShowDock(OUTPUT_AREA_URI);
  }
}
