'use babel'

import { log, INSPECTOR_URI, OUTPUT_AREA_URI, openOrShowDock } from "./utils"
import { getCodeToInspect } from "./code-manager"
import OutputPane from "./panes/output-area"

export function hideInspector(store) {
  store.insBundle = null
  return atom.workspace.hide(INSPECTOR_URI)
}

export async function showInspector(store) {
  const activeElement = document.activeElement
  await atom.workspace.open(INSPECTOR_URI, { searchAllPanes: true })
  activeElement.focus()
  if (!store) { return }
  const { editor, kernel } = store
  if (!editor || !kernel) {
    store.insBundle = "No kernel running!"
    return
  }
  const [code, cursorPos] = getCodeToInspect(editor)
  if (!code || cursorPos === 0) {
    store.insBundle = "No code to introspect!"
    return
  }
  kernel.inspect(code, cursorPos, result => {
    log("Inspector: Result:", result)
    if (!result.found) {
      store.insBundle = "No introspection available!"
    } else {
      store.insBundle = result.data
      kernel.setInspectorResult(result.data, editor)
    }
  })
}

export function toggleOutputMode() {
  // There should never be more than one instance of OutputArea
  const outputArea = atom.workspace
    .getPaneItems()
    .find(paneItem => paneItem instanceof OutputPane)
  if (outputArea) {
    return outputArea.destroy()
  } else {
    openOrShowDock(OUTPUT_AREA_URI)
  }
}
