'use babel'

import { Emitter, CompositeDisposable, Disposable, Point } from "atom"
import debounce from "lodash/debounce"
import { autorun } from "mobx"
import InspectorPane from "./panes/inspector"
import WatchesPane from "./panes/watches"
import OutputPane from "./panes/output-area"
import KernelMonitorPane from "./panes/kernel-monitor"
import Config from "./config"
import ZMQKernel from "./zmq-kernel"
import WSKernel from "./ws-kernel"
import Kernel from "./kernel"
import KernelPicker from "./kernel-picker"
import WSKernelPicker from "./ws-kernel-picker"
import ExistingKernelPicker from "./existing-kernel-picker"
import HydrogenProvider from "./plugin-api/hydrogen-provider"
import store from "./store"
import { KernelManager } from "./kernel-manager"
import services from "./services"
import * as commands from "./commands"
import * as codeManager from "./code-manager"
import * as result from "./result"
import {
  log,
  isMultilanguageGrammar,
  INSPECTOR_URI,
  WATCHES_URI,
  OUTPUT_AREA_URI,
  KERNEL_MONITOR_URI,
  hotReloadPackage,
  openOrShowDock,
  kernelSpecProvidesGrammar
} from "./utils"
import { exportNotebook } from "./export-notebook"
import { importNotebook, ipynbOpener } from "./import-notebook"

export const config = Config.schema
let emitter
let kernelPicker
let existingKernelPicker
let wsKernelPicker
let hydrogenProvider
const kernelManager = new KernelManager()

export function activate() {
  emitter = new Emitter()
  let skipLanguageMappingsChange = false
  store.subscriptions.add(
    atom.config.onDidChange(
      "hydrogen-next.languageMappings",
      ({ newValue, oldValue }) => {
        if (skipLanguageMappingsChange) {
          skipLanguageMappingsChange = false
          return
        }

        if (store.runningKernels.length != 0) {
          skipLanguageMappingsChange = true
          atom.config.set("hydrogen-next.languageMappings", oldValue)
          atom.notifications.addError("hydrogen", {
            description:
              "`languageMappings` cannot be updated while kernels are running",
            dismissable: false
          })
        }
      }
    )
  )
  store.subscriptions.add(
    atom.config.observe("hydrogen-next.statusBarDisable", newValue => {
      store.setConfigValue("hydrogen-next.statusBarDisable", Boolean(newValue))
    }),
    atom.config.observe("hydrogen-next.statusBarKernelInfo", newValue => {
      store.setConfigValue("hydrogen-next.statusBarKernelInfo", Boolean(newValue))
    })
  )
  store.subscriptions.add(
    atom.commands.add("atom-text-editor:not([mini])", {
      "hydrogen-next:run": () => run(),
      "hydrogen-next:run-all": () => runAll(),
      "hydrogen-next:run-all-above": () => runAllAbove(),
      "hydrogen-next:run-and-move-down": () => run(true),
      "hydrogen-next:run-cell": () => runCell(),
      "hydrogen-next:run-cell-and-move-down": () => runCell(true),
      "hydrogen-next:toggle-watches": () => atom.workspace.toggle(WATCHES_URI),
      "hydrogen-next:toggle-output-area": () => commands.toggleOutputMode(),
      "hydrogen-next:start-local-kernel": () => startZMQKernel(),
      "hydrogen-next:connect-to-remote-kernel": () => connectToWSKernel(),
      "hydrogen-next:connect-to-existing-kernel": () => connectToExistingKernel(),
      "hydrogen-next:add-watch": () => {
        if (store.kernel) {
          store.kernel.watchesStore.addWatchFromEditor(store.editor)
          openOrShowDock(WATCHES_URI)
        }
      },
      "hydrogen-next:remove-watch": () => {
        if (store.kernel) {
          store.kernel.watchesStore.removeWatch()
          openOrShowDock(WATCHES_URI)
        }
      },
      "hydrogen-next:update-kernels": async () => {
        await kernelManager.updateKernelSpecs()
      },
      "hydrogen-next:toggle-inspector": () => commands.toggleInspector(store),
      "hydrogen-next:interrupt-kernel": () =>
        handleKernelCommand( { command: "interrupt-kernel" }, store ),
      "hydrogen-next:restart-kernel": () =>
        handleKernelCommand( { command: "restart-kernel" }, store ),
      "hydrogen-next:shutdown-kernel": () =>
        handleKernelCommand( { command: "shutdown-kernel" }, store ),
      "hydrogen-next:export-notebook": () => exportNotebook(),
      "hydrogen-next:fold-current-cell": () => foldCurrentCell(),
      "hydrogen-next:fold-all-but-current-cell": () => foldAllButCurrentCell(),
      "hydrogen-next:clear-results": () => result.clearResults(store),
      'hydrogen-next:clear-and-restart': () => clearAndRestart(),
      'hydrogen-next:clear-and-center': () => clearAndCenter(),
      'hydrogen-next:recalculate-all': () => recalculateAll(),
      'hydrogen-next:recalculate-all-above': () => recalculateAllAbove(),
      'hydrogen-next:run-all-inline': () => runAllInline(),
      'hydrogen-next:recalculate-all-inline': () => recalculateAllInline(),
      'hydrogen-next:run-all-above-inline': () => runAllAboveInline(),
      'hydrogen-next:run-all-below-inline': () => runAllBelowInline(),
      'hydrogen-next:recalculate-all-above-inline': () => recalculateAllAboveInline(),
    })
  )
  store.subscriptions.add(
    atom.commands.add("atom-workspace", {
      "hydrogen-next:import-notebook": importNotebook,
      "hydrogen-next:debug-toggle": () => {
        atom.config.set('hydrogen-next.debug', !atom.config.get('hydrogen-next.debug'))
      },
      "hydrogen-next:toggle-kernel-monitor": async () => {
        atom.workspace.toggle(KERNEL_MONITOR_URI)
      },
      "hydrogen-next:open-examples": () => openExamples(),
      "hydrogen-next:shutdown-all-kernels": () => shutdownAllKernels(),
    })
  )

  if (atom.inDevMode()) {
    store.subscriptions.add(
      atom.commands.add("atom-workspace", {
        "hydrogen-next:hot-reload-package": () => hotReloadPackage()
      })
    )
  }

  store.subscriptions.add(
    atom.workspace.observeActiveTextEditor(editor => {
      store.updateEditor(editor)
    })
  )
  store.subscriptions.add(
    atom.workspace.observeTextEditors(editor => {
      const editorSubscriptions = new CompositeDisposable()
      editorSubscriptions.add(
        editor.onDidChangeGrammar(() => {
          store.setGrammar(editor)
        })
      )

      if (isMultilanguageGrammar(editor.getGrammar())) {
        editorSubscriptions.add(
          editor.onDidChangeCursorPosition(
            debounce(() => {
              store.setGrammar(editor)
            }, 75)
          )
        )
      }

      editorSubscriptions.add(
        editor.onDidDestroy(() => {
          editorSubscriptions.dispose()
        })
      )
      editorSubscriptions.add(
        editor.onDidChangeTitle(newTitle => store.forceEditorUpdate())
      )
      store.subscriptions.add(editorSubscriptions)
    })
  )
  hydrogenProvider = null
  store.subscriptions.add(
    atom.workspace.addOpener(uri => {
      switch (uri) {
        case INSPECTOR_URI:
          return new InspectorPane(store)

        case WATCHES_URI:
          return new WatchesPane(store)

        case OUTPUT_AREA_URI:
          return new OutputPane(store)

        case KERNEL_MONITOR_URI:
          return new KernelMonitorPane(store)

        default: {
          return
        }
      }
    })
  )
  store.subscriptions.add(atom.workspace.addOpener(ipynbOpener))
  store.subscriptions.add(
    // Destroy any Panes when the package is deactivated.
    new Disposable(() => {
      atom.workspace.getPaneItems().forEach(item => {
        if (
          item instanceof InspectorPane ||
          item instanceof WatchesPane ||
          item instanceof OutputPane ||
          item instanceof KernelMonitorPane
        ) {
          item.destroy()
        }
      })
    })
  )
  autorun(() => {
    emitter.emit("did-change-kernel", store.kernel)
  })
}

export function deactivate() {
  store.dispose()
}

export function provideHydrogen() {
  if (!hydrogenProvider) {
    hydrogenProvider = new HydrogenProvider(emitter)
  }

  return hydrogenProvider
}

export function provideAutocompleteResults() {
  return services.provided.autocomplete.provideAutocompleteResults(store)
}

export function consumeAutocompleteWatchEditor(watchEditor) {
  return services.consumed.autocomplete.consume(store, watchEditor)
}

export function consumeStatusBar(statusBar) {
  return services.consumed.statusBar.addStatusBar(
    store,
    statusBar,
    handleKernelCommand
  )
}

function connectToExistingKernel() {
  if (!existingKernelPicker) {
    existingKernelPicker = new ExistingKernelPicker()
  }

  existingKernelPicker.toggle()
}

function handleKernelCommand(
  { command, payload },
  { kernel, markers }
) {
  log("handleKernelCommand:", [
    { command, payload },
    { kernel, markers }
  ])

  if (!kernel) {
    const message = "No running kernel for grammar or editor found"
    atom.notifications.addError(message)
    return
  }

  if (command === "interrupt-kernel") {
    kernel.interrupt()
  } else if (command === "restart-kernel") {
    kernel.restart()
  } else if (command === "shutdown-kernel") {
    if (markers) {
      markers.clear()
    }
    // Note that destroy alone does not shut down a WSKernel
    kernel.shutdown()
    kernel.destroy()
  } else if (
    command === "rename-kernel" &&
    kernel.transport instanceof WSKernel
  ) {
    kernel.transport.promptRename()
  } else if (command === "disconnect-kernel") {
    if (markers) {
      markers.clear()
    }
    kernel.destroy()
  }
}

function run(moveDown = false) {
  const editor = store.editor
  if (!editor) { return }
  // https://github.com/nteract/hydrogen/issues/1452
  atom.commands.dispatch(editor.element, "autocomplete-plus:cancel")
  for (let codeBlock of codeManager.findCodeBlocks(editor)) {
    if (!codeBlock) { return }
    const codeNullable = codeBlock.code
    if (codeNullable === null) { return }
    const { row } = codeBlock
    const cellType = codeManager.getMetadataForRow(editor, new Point(row, 0))
    const code =
      cellType === "markdown"
        ? codeManager.removeCommentsMarkdownCell(editor, codeNullable)
        : codeNullable
    if (moveDown) { codeManager.moveDown(editor, row) }
    checkForKernel(store, kernel => {
      result.createResult(store, { code, row, cellType })
    })
  }
}

function runAll(breakpoints) {
  const { editor, kernel, grammar, filePath } = store
  if (!editor || !grammar || !filePath) {
    return
  }

  if (isMultilanguageGrammar(editor.getGrammar())) {
    atom.notifications.addError(
      '"Run All" is not supported for this file type!'
    )
    return
  }

  if (editor && kernel) {
    _runAll(editor, kernel, breakpoints)

    return
  }

  kernelManager.startKernelFor(grammar, editor, filePath, kernel => {
    _runAll(editor, kernel, breakpoints)
  })
}

function _runAll(editor, kernel, breakpoints) {
  const cells = codeManager.getCells(editor, breakpoints)

  for (const cell of cells) {
    const { start, end } = cell
    const codeNullable = codeManager.getTextInRange(editor, start, end)
    if (codeNullable === null) {
      continue
    }
    const row = codeManager.escapeBlankRows(
      editor,
      start.row,
      codeManager.getEscapeBlankRowsEndRow(editor, end)
    )
    const cellType = codeManager.getMetadataForRow(editor, start)
    const code =
      cellType === "markdown"
        ? codeManager.removeCommentsMarkdownCell(editor, codeNullable)
        : codeNullable
    checkForKernel(store, kernel => {
      result.createResult(store, {
        code,
        row,
        cellType
      })
    })
  }
}

function runAllAbove() {
  const { editor, kernel, grammar, filePath } = store
  if (!editor || !grammar || !filePath) {
    return
  }

  if (isMultilanguageGrammar(editor.getGrammar())) {
    atom.notifications.addError(
      '"Run All Above" is not supported for this file type!'
    )
    return
  }

  if (editor && kernel) {
    _runAllAbove(editor, kernel)

    return
  }

  kernelManager.startKernelFor(grammar, editor, filePath, kernel => {
    _runAllAbove(editor, kernel)
  })
}

function _runAllAbove(editor, kernel) {
  const cursor = editor.getCursorBufferPosition()
  cursor.column = editor.getBuffer().lineLengthForRow(cursor.row)
  const breakpoints = codeManager.getBreakpoints(editor)
  breakpoints.push(cursor)
  const cells = codeManager.getCells(editor, breakpoints)

  for (const cell of cells) {
    const { start, end } = cell
    const codeNullable = codeManager.getTextInRange(editor, start, end)
    const row = codeManager.escapeBlankRows(
      editor,
      start.row,
      codeManager.getEscapeBlankRowsEndRow(editor, end)
    )
    const cellType = codeManager.getMetadataForRow(editor, start)

    if (codeNullable !== null) {
      const code =
        cellType === "markdown"
          ? codeManager.removeCommentsMarkdownCell(editor, codeNullable)
          : codeNullable
      checkForKernel(store, kernel => {
        result.createResult(store, {
          code,
          row,
          cellType
        })
      })
    }

    if (cell.containsPoint(cursor)) {
      break
    }
  }
}

function runCell(moveDown = false) {
  const editor = store.editor
  if (!editor) {
    return
  }
  // https://github.com/nteract/hydrogen/issues/1452
  atom.commands.dispatch(editor.element, "autocomplete-plus:cancel")
  const { start, end } = codeManager.getCurrentCell(editor)
  const codeNullable = codeManager.getTextInRange(editor, start, end)
  if (codeNullable === null) {
    return
  }
  const row = codeManager.escapeBlankRows(
    editor,
    start.row,
    codeManager.getEscapeBlankRowsEndRow(editor, end)
  )
  const cellType = codeManager.getMetadataForRow(editor, start)
  const code =
    cellType === "markdown"
      ? codeManager.removeCommentsMarkdownCell(editor, codeNullable)
      : codeNullable

  if (moveDown) {
    codeManager.moveDown(editor, row)
  }

  checkForKernel(store, kernel => {
    result.createResult(store, {
      code,
      row,
      cellType
    })
  })
}

function foldCurrentCell() {
  const editor = store.editor
  if (!editor) {
    return
  }
  codeManager.foldCurrentCell(editor)
}

function foldAllButCurrentCell() {
  const editor = store.editor
  if (!editor) {
    return
  }
  codeManager.foldAllButCurrentCell(editor)
}

function startZMQKernel() {
  kernelManager.getAllKernelSpecsForGrammar(store.grammar).then(kernelSpecs => {
    if (kernelPicker) {
      kernelPicker.kernelSpecs = kernelSpecs
    } else {
      kernelPicker = new KernelPicker(kernelSpecs)

      kernelPicker.onConfirmed = kernelSpec => {
        const { editor, grammar, filePath, markers } = store
        if (!editor || !grammar || !filePath || !markers) {
          return
        }
        markers.clear()
        kernelManager.startKernel(kernelSpec, grammar, editor, filePath)
      }
    }

    kernelPicker.toggle()
  })
}

function connectToWSKernel() {
  if (!wsKernelPicker) {
    wsKernelPicker = new WSKernelPicker(transport => {
      const kernel = new Kernel(transport)
      const { editor, grammar, filePath, markers } = store
      if (!editor || !grammar || !filePath || !markers) {
        return
      }
      markers.clear()
      if (kernel.transport instanceof ZMQKernel) {
        kernel.destroy()
      }
      store.newKernel(kernel, filePath, editor, grammar)
    })
  }

  wsKernelPicker.toggle(kernelSpec =>
    kernelSpecProvidesGrammar(kernelSpec, store.grammar)
  )
}

// Accepts store as an arg
function checkForKernel({ editor, grammar, filePath, kernel }, callback) {
  if (!filePath || !grammar) {
    return atom.notifications.addError(
      "The language grammar must be set in order to start a kernel. The easiest way to do this is to save the file."
    )
  }

  if (kernel) {
    callback(kernel)
    return
  }

  kernelManager.startKernelFor(grammar, editor, filePath, newKernel =>
    callback(newKernel)
  )
}

function restartKernel() {
  store.kernel.restart()
}

function clearAndRestart() {
  let editor = store.editor
  if (!editor) { return }
  clearAndCenter()
  restartKernel()
}

function clearAndCenter() {
  let editor = store.editor
  if (!editor) { return }
  result.clearResults(store)
  editor.scrollToCursorPosition()
}

function recalculateAll() {
  let editor = store.editor
  if (!editor) { return }
  clearAndRestart()
  runAll()
}

function recalculateAllAbove() {
  let editor = store.editor
  if (!editor) { return }
  clearAndCenter()
  restartKernel()
  runAllAbove()
}

function runAllInline() {
  let editor = store.editor
  if (!editor) { return }
  let lastRow = editor.getLastBufferRow()
  let currPos = editor.getCursorBufferPosition()
  editor.setCursorBufferPosition([0,0])
  while (true) {
    let currRow = editor.getCursorBufferPosition().row
    if (currRow<lastRow) {
      run(true)
      if (editor.getCursorBufferPosition().row==currRow) {
        editor.moveDown()
      }
    } else if (currRow==lastRow) {
      if (editor.lineTextForBufferRow(lastRow)!=='') {
        run()
      }
      break
    } else {
      break
    }
  }
  editor.setCursorBufferPosition(currPos, { autoscroll:false })
  editor.scrollToBufferPosition(currPos, { center:true })
}

function recalculateAllInline() {
  let editor = store.editor
  if (!editor) { return }
  clearAndCenter()
  restartKernel()
  runAllInline()
}

function runAllAboveInline() {
  let editor = store.editor
  if (!editor) { return }
  let lastCur = editor.getCursorBufferPosition()
  let lastRow = lastCur.row
  editor.setCursorBufferPosition([0,0])
  while (true) {
    let currRow = editor.getCursorBufferPosition().row
    if (currRow<lastRow) {
      run(true)
      if (editor.getCursorBufferPosition().row==currRow) {
        editor.moveDown()
      }
    } else if (currRow==lastRow) {
      if (editor.lineTextForBufferRow(lastRow)!=='') {
        run()
      }
      break
    } else {
      break
    }
  }
  editor.setCursorBufferPosition(lastCur)
}

function recalculateAllAboveInline() {
  let editor = store.editor
  if (!editor) { return }
  clearAndCenter()
  restartKernel()
  runAllAboveInline()
}

function runAllBelowInline() {
  let editor = store.editor
  if (!editor) { return }
  let lastRow = editor.getLastBufferRow()
  let currPos = editor.getCursorBufferPosition()
  while (true) {
    let currRow = editor.getCursorBufferPosition().row
    if (currRow<lastRow) {
      run(true)
      if (editor.getCursorBufferPosition().row==currRow) {
        editor.moveDown()
      }
    } else if (currRow==lastRow) {
      if (editor.lineTextForBufferRow(lastRow)!=='') {
        run()
      }
      break
    } else {
      break
    }
  }
  editor.setCursorBufferPosition(currPos)
  editor.scrollToBufferPosition(currPos, { center:true })
}

function openExamples() {
  atom.open({ pathsToOpen: __dirname+'/../examples'})
}

function shutdownAllKernels() {
  for (let kernel of store.runningKernels) {
    kernel.shutdown()
    kernel.destroy()
  }
}
