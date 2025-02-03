'use babel'

import { log, INSPECTOR_URI, OUTPUT_AREA_URI, openOrShowDock } from "./utils"
import { getCodeToInspect } from "./code-manager"
import OutputPane from "./panes/output-area"

export function toggleInspector(store) {
  const { editor, kernel } = store

  if (!editor || !kernel) {
    atom.notifications.addInfo("No kernel running!")
    return
  }

  const [code, cursorPos] = getCodeToInspect(editor)

  if (!code || cursorPos === 0) {
    atom.notifications.addInfo("No code to introspect!")
    return
  }

  kernel.inspect(code, cursorPos, result => {
    log("Inspector: Result:", result)

    if (!result.found) {
      atom.workspace.hide(INSPECTOR_URI)
      atom.notifications.addInfo("No introspection available!")
      return
    }

    kernel.setInspectorResult(result.data, editor)
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
