/** @babel */

import { Emitter, CompositeDisposable, Disposable, Point } from "atom";
import debounce from "lodash/debounce";
import { autorun } from "mobx";
import Config from "./config";
import store from "./store";
import { KernelManager } from "./kernel-manager";
import services from "./services";
import { setScrollKeeperService } from "./scroll-keeper";
import { emitBreakpointsUpdate } from "./services/provided/breakpoints";
import {
  log,
  isMultilanguageGrammar,
  INSPECTOR_URI,
  WATCHES_URI,
  OUTPUT_AREA_URI,
  KERNEL_MONITOR_URI,
  VARIABLE_EXPLORER_URI,
  DATA_EXPLORER_URI,
  hotReloadPackage,
  openOrShowDock,
  openInCenter,
  kernelSpecProvidesGrammar,
} from "./utils";
import ExecPanel from "./exec-panel";

/**
 * Hydrogen Next Package
 * Provides interactive computing within Pulsar using Jupyter kernels.
 * Supports code execution, watches, variable explorer, and notebook import.
 */

export const config = Config.schema;
let emitter;
let kernelPicker;
let existingKernelPicker;
let wsKernelPicker;
let hydrogenProvider;
let execPanel;
let claudeChatService = null;
let imageEditorService = null;
let terminalService = null;
let terminalSpawnService = null;
let hydrogenAdapterServices = [];
const kernelManager = new KernelManager();

/**
 * Activates the package and registers kernel execution commands.
 */
export function activate() {
  emitter = new Emitter();
  let skipLanguageMappingsChange = false;
  store.subscriptions.add(
    atom.config.onDidChange("hydrogen-next.languageMappings", ({ oldValue }) => {
      if (skipLanguageMappingsChange) {
        skipLanguageMappingsChange = false;
        return;
      }

      if (store.runningKernels.length !== 0) {
        skipLanguageMappingsChange = true;
        atom.config.set("hydrogen-next.languageMappings", oldValue);
        atom.notifications.addError("hydrogen-next", {
          description: "`languageMappings` cannot be updated while kernels are running",
          dismissable: false,
        });
      }
    }),
  );
  store.subscriptions.add(
    atom.config.observe("hydrogen-next.statusBarDisable", (newValue) => {
      store.setConfigValue("hydrogen-next.statusBarDisable", Boolean(newValue));
    }),
    atom.config.observe("hydrogen-next.statusBarKernelInfo", (newValue) => {
      store.setConfigValue("hydrogen-next.statusBarKernelInfo", Boolean(newValue));
    }),
  );
  store.subscriptions.add(
    atom.commands.add("atom-text-editor:not([mini])", {
      "hydrogen-next:run": (event) => run(false, event),
      "hydrogen-next:run-all": (event) => runAll(null, event),
      "hydrogen-next:run-all-above": (event) => runAllAbove(event),
      "hydrogen-next:run-and-move-down": (event) => run(true, event),
      "hydrogen-next:run-cell": (event) => runCell(false, event),
      "hydrogen-next:run-cell-and-move-down": (event) => runCell(true, event),
      "hydrogen-next:toggle-watches": () => atom.workspace.toggle(WATCHES_URI),
      "hydrogen-next:toggle-variable-explorer": () => atom.workspace.toggle(VARIABLE_EXPLORER_URI),
      "hydrogen-next:toggle-output-area": () => require("./commands").toggleOutputMode(),
      "hydrogen-next:start-local-kernel": (event) => startZMQKernel(event),
      "hydrogen-next:connect-to-remote-kernel": () => connectToWSKernel(),
      "hydrogen-next:connect-to-existing-kernel": () => connectToExistingKernel(),
      "hydrogen-next:add-watch": () => addWatch(),
      "hydrogen-next:remove-watch": (event) => removeWatch(event),
      "hydrogen-next:update-kernels": () => updateKernels(),
      "hydrogen-next:interrupt-kernel": (event) => handleKernelSignal("interrupt-kernel", event),
      "hydrogen-next:restart-kernel": (event) => handleKernelSignal("restart-kernel", event),
      "hydrogen-next:shutdown-kernel": (event) => handleKernelSignal("shutdown-kernel", event),
      "hydrogen-next:rename-remote-session": () =>
        handleKernelCommand({ command: "rename-kernel" }, store),
      "hydrogen-next:disconnect-remote-session": () =>
        handleKernelCommand({ command: "disconnect-kernel" }, store),
      "hydrogen-next:export-notebook": () => require("./export-notebook").exportNotebook(),
      "hydrogen-next:fold-current-cell": () => foldCurrentCell(),
      "hydrogen-next:fold-all-but-current-cell": () => foldAllButCurrentCell(),
      "hydrogen-next:clear-results": (event) => clearResults(event),
      "hydrogen-next:clear-and-restart": () => clearAndRestart(),
      "hydrogen-next:clear-and-center": () => clearAndCenter(),
      "hydrogen-next:recalculate-all": () => recalculateAll(),
      "hydrogen-next:recalculate-all-above": () => recalculateAllAbove(),
      "hydrogen-next:run-all-inline": (event) => runAllInline(event),
      "hydrogen-next:recalculate-all-inline": () => recalculateAllInline(),
      "hydrogen-next:run-all-above-inline": (event) => runAllAboveInline(event),
      "hydrogen-next:run-all-below-inline": (event) => runAllBelowInline(event),
      "hydrogen-next:recalculate-all-above-inline": () => recalculateAllAboveInline(),
      "hydrogen-next:go-to-next-cell": () => require("./cell-navi").nextCell(),
      "hydrogen-next:go-to-previous-cell": () => require("./cell-navi").previousCell(),
      "hydrogen-next:select-cell": () => require("./cell-navi").selectCell(),
      "hydrogen-next:select-previous-cell": () => require("./cell-navi").selectUp(),
      "hydrogen-next:select-next-cell": () => require("./cell-navi").selectDown(),
      "hydrogen-next:move-cell-up": () => require("./cell-navi").moveCellUp(),
      "hydrogen-next:move-cell-down": () => require("./cell-navi").moveCellDown(),
      "hydrogen-next:open-jupyter-console": () =>
        require("./launch-jupyter").openJupyterConsole(terminalService),
      "hydrogen-next:spawn-jupyter-console": () =>
        require("./launch-jupyter").spawnJupyterConsole(terminalSpawnService),
      "hydrogen-next:copy-jupyter-console-command": () =>
        require("./launch-jupyter").copyJupyterConsoleCommand(),
    }),
    atom.commands.add(".jupyter-notebook", {
      "hydrogen-next:run": (event) => runAdapterCommand("editor", false, event),
      "hydrogen-next:run-all": (event) => runAdapterCommand("all", false, event),
      "hydrogen-next:run-all-above": (event) => runAdapterCommand("above", false, event),
      "hydrogen-next:run-and-move-down": (event) => runAdapterCommand("editor", true, event),
      "hydrogen-next:run-cell": (event) => runAdapterCommand("active", false, event),
      "hydrogen-next:run-cell-and-move-down": (event) => runAdapterCommand("active", true, event),
      "hydrogen-next:run-all-inline": (event) => runAdapterCommand("all", false, event),
      "hydrogen-next:run-all-above-inline": (event) => runAdapterCommand("above", false, event),
      "hydrogen-next:run-all-below-inline": (event) => runAdapterCommand("below", false, event),
      "hydrogen-next:clear-results": (event) => clearAdapterResults(event),
      "hydrogen-next:start-local-kernel": (event) => startAdapterLocalKernel(event),
      "hydrogen-next:interrupt-kernel": (event) =>
        handleAdapterKernelSignal("interrupt-kernel", event),
      "hydrogen-next:restart-kernel": (event) => handleAdapterKernelSignal("restart-kernel", event),
      "hydrogen-next:shutdown-kernel": (event) =>
        handleAdapterKernelSignal("shutdown-kernel", event),
    }),
    atom.commands.add("atom-workspace", {
      "hydrogen-next:import-notebook": (event) =>
        require("./import-notebook").importNotebook(event),
      "hydrogen-next:data-explorer": () => exploreData(),
      "hydrogen-next:debug-toggle": () => debugToggle(),
      "hydrogen-next:toggle-kernel-monitor": () => toggleKernelMonitor(),
      "hydrogen-next:toggle-exec-panel": () => toggleExecPanel(),
      "hydrogen-next:open-examples": () => openExamples(),
      "hydrogen-next:open-gateways": () => Config.openGateways(),
      "hydrogen-next:shutdown-all-kernels": () => shutdownAllKernels(),
      "hydrogen-next:show-inspector": () =>
        require("./commands").showInspector(store, hydrogenAdapterServices),
      "hydrogen-next:hide-inspector": () => require("./commands").hideInspector(store),
      "hydrogen-next:attach-to-claude": () => attachResultToClaude(),
    }),
  );

  if (atom.inDevMode()) {
    store.subscriptions.add(
      atom.commands.add("atom-workspace", {
        "hydrogen-next:hot-reload-package": () => hotReloadPackage(),
      }),
    );
  }

  store.subscriptions.add(
    // Track only the center container, so activating a dock (e.g. tree-view)
    // does not clear the external kernel context of a notebook pane item.
    atom.workspace.getCenter().onDidChangeActivePaneItem((item) => {
      store.updateActivePaneItem(item);
    }),
    atom.workspace.observeActiveTextEditor((editor) => {
      // Keep the last source editor as the active context when focus moves to a
      // non-editor center item (e.g. the Data Explorer pane). Otherwise the
      // active editor (and therefore store.kernel) would become null and panels
      // like the Variable Explorer / Data Explorer would lose the running kernel.
      if (editor) {
        store.updateEditor(editor);
      }
    }),
  );
  store.subscriptions.add(
    atom.workspace.observeTextEditors((editor) => {
      const editorSubscriptions = new CompositeDisposable();
      editorSubscriptions.add(
        editor.onDidChangeGrammar(() => {
          store.setGrammar(editor);
        }),
      );

      if (isMultilanguageGrammar(editor.getGrammar())) {
        editorSubscriptions.add(
          editor.onDidChangeCursorPosition(
            debounce(() => {
              store.setGrammar(editor);
            }, 75),
          ),
        );
      }

      editorSubscriptions.add(
        editor.onDidDestroy(() => {
          editorSubscriptions.dispose();
          // We keep the last editor sticky (see observeActiveTextEditor), so when
          // that editor is destroyed fall back to the current active editor to
          // avoid holding a stale reference.
          if (store.editor === editor) {
            store.updateEditor(atom.workspace.getActiveTextEditor() || null);
          }
        }),
      );
      editorSubscriptions.add(editor.onDidChangeTitle(() => store.forceEditorUpdate()));

      if (atom.config.get("hydrogen-next.cellMarkers")) {
        const codeManager = require("./code-manager");
        codeManager.prepareCellDecoration(editor);
        const updateMarkers = () => {
          const breakpoints = codeManager.updateCellMarkers(editor);
          emitBreakpointsUpdate(editor, breakpoints);
        };
        updateMarkers();
        editorSubscriptions.add(
          editor.onDidTokenize(updateMarkers),
          editor.buffer.onDidStopChanging(updateMarkers),
          new Disposable(() => {
            codeManager.destroyCellMarkers(editor);
          }),
        );
      }

      store.subscriptions.add(editorSubscriptions);
    }),
  );
  hydrogenProvider = null;
  store.subscriptions.add(
    atom.workspace.addOpener((uri) => {
      switch (uri) {
        case INSPECTOR_URI: {
          const InspectorPane = require("./panes/inspector");
          return new InspectorPane(store);
        }

        case WATCHES_URI: {
          const WatchesPane = require("./panes/watches");
          return new WatchesPane(store);
        }

        case OUTPUT_AREA_URI: {
          const OutputPane = require("./panes/output-area");
          return new OutputPane(store);
        }

        case KERNEL_MONITOR_URI: {
          const KernelMonitorPane = require("./panes/kernel-monitor");
          return new KernelMonitorPane(store);
        }

        case VARIABLE_EXPLORER_URI: {
          const VariableExplorerPane = require("./panes/variable-explorer");
          return new VariableExplorerPane(store);
        }

        case DATA_EXPLORER_URI: {
          const DataExplorerPane = require("./panes/data-explorer");
          return new DataExplorerPane();
        }

        default: {
          return;
        }
      }
    }),
  );
  store.subscriptions.add(atom.workspace.addOpener(require("./import-notebook").ipynbOpener));
  store.subscriptions.add(
    // Destroy any Panes when the package is deactivated.
    new Disposable(() => {
      atom.workspace.getPaneItems().forEach((item) => {
        const InspectorPane = require("./panes/inspector");
        const WatchesPane = require("./panes/watches");
        const OutputPane = require("./panes/output-area");
        const KernelMonitorPane = require("./panes/kernel-monitor");
        const VariableExplorerPane = require("./panes/variable-explorer");
        const DataExplorerPane = require("./panes/data-explorer");
        if (
          item instanceof InspectorPane ||
          item instanceof WatchesPane ||
          item instanceof OutputPane ||
          item instanceof KernelMonitorPane ||
          item instanceof VariableExplorerPane ||
          item instanceof DataExplorerPane
        ) {
          item.destroy();
        }
      });
    }),
  );
  autorun(() => {
    emitter.emit("did-change-kernel", store.kernel);
  });
}

export function deactivate() {
  if (execPanel) {
    execPanel.destroy();
    execPanel = null;
  }
  store.dispose();
}

export function provideHydrogen() {
  if (!hydrogenProvider) {
    const HydrogenProvider = require("./plugin-api/hydrogen-provider");
    hydrogenProvider = new HydrogenProvider(emitter);
  }

  return hydrogenProvider;
}

export function provideAutocompleteResults() {
  return services.provided.autocomplete.provideAutocompleteResults(store);
}

export function provideBreakpoints() {
  return services.provided.breakpoints.provideBreakpoints();
}

export function consumeAutocompleteWatchEditor(watchEditor) {
  return services.consumed.autocomplete.observe(store, watchEditor);
}

export function consumeStatusBar(statusBar) {
  return services.consumed.statusBar.addStatusBar(store, statusBar, handleKernelCommand);
}

export function consumeClaudeChat(service) {
  claudeChatService = service;
  return new Disposable(() => {
    claudeChatService = null;
  });
}

export function consumeImageEditor(service) {
  imageEditorService = service;
  return new Disposable(() => {
    imageEditorService = null;
  });
}

export function consumeHydrogenAdapter(service) {
  hydrogenAdapterServices.push(service);
  return new Disposable(() => {
    hydrogenAdapterServices = hydrogenAdapterServices.filter((candidate) => candidate !== service);
  });
}

export function getImageEditorService() {
  return imageEditorService;
}

export function consumeTerminal(service) {
  terminalService = service;
  return new Disposable(() => {
    terminalService = null;
  });
}

export function consumeTerminalSpawn(service) {
  terminalSpawnService = service;
  return new Disposable(() => {
    terminalSpawnService = null;
  });
}

export function consumeScrollKeeper(service) {
  setScrollKeeperService(service);
  return new Disposable(() => {
    setScrollKeeperService(null);
  });
}

function connectToExistingKernel() {
  if (!existingKernelPicker) {
    const ExistingKernelPicker = require("./existing-kernel-picker");
    existingKernelPicker = new ExistingKernelPicker();
  }

  existingKernelPicker.toggle();
}

function handleKernelCommand({ command, payload }, { kernel, markers }) {
  log("handleKernelCommand:", [
    { command, payload },
    { kernel, markers },
  ]);

  if (command === "open-jupyter-console") {
    require("./launch-jupyter").openJupyterConsole(terminalService);
    return;
  }

  if (command === "spawn-jupyter-console") {
    require("./launch-jupyter").spawnJupyterConsole(terminalSpawnService);
    return;
  }

  if (!kernel) {
    const message = "No running kernel for grammar or editor found";
    atom.notifications.addError(message);
    return;
  }

  if (command === "interrupt-kernel") {
    kernel.interrupt();
  } else if (command === "restart-kernel") {
    kernel.restart();
  } else if (command === "shutdown-kernel") {
    if (markers) {
      markers.clear();
    }
    // Note that destroy alone does not shut down a WSKernel
    kernel.shutdown();
    kernel.destroy();
  } else if (command === "rename-kernel") {
    if (kernel.transport instanceof require("./ws-kernel")) {
      kernel.transport.promptRename();
    } else {
      atom.notifications.addWarning("Rename is only available for remote kernels");
    }
  } else if (command === "disconnect-kernel") {
    if (kernel.transport instanceof require("./ws-kernel")) {
      if (markers) {
        markers.clear();
      }
      kernel.destroy();
    } else {
      atom.notifications.addWarning(
        "Disconnect is only available for remote kernels. Use 'Shutdown Kernel' for local kernels.",
      );
    }
  }
}

function handleKernelSignal(command, event = null) {
  if (handleAdapterKernelSignal(command, event)) {
    return;
  }
  handleKernelCommand({ command }, store);
}

function handleAdapterKernelSignal(command, event = null) {
  const handled = require("./adapter-integration").handleAdapterKernelCommand(
    hydrogenAdapterServices,
    command,
  );
  if (handled) event?.stopPropagation?.();
  return handled;
}

function runAdapterCommand(scope, moveDown = false, event = null) {
  const handled = require("./adapter-integration").runAdapterTargets(
    hydrogenAdapterServices,
    kernelManager,
    { scope, moveDown },
  );
  if (handled) event?.stopPropagation?.();
  return handled;
}

function clearAdapterResults(event = null) {
  const handled = require("./adapter-integration").clearAdapterResults(hydrogenAdapterServices);
  if (handled) event?.stopPropagation?.();
  return handled;
}

function clearResults(event = null) {
  if (clearAdapterResults(event)) {
    return;
  }
  require("./result").clearResults(store);
}

function run(moveDown = false, event = null) {
  if (runAdapterCommand("editor", moveDown, event)) {
    return;
  }

  const { editor, grammar, filePath } = store;
  if (!editor || !grammar || !filePath) {
    return;
  }
  // https://github.com/nteract/hydrogen/issues/1452
  atom.commands.dispatch(editor.element, "autocomplete-plus:cancel");
  // Capture code blocks before checkForKernel to avoid cursor movement during kernel selection
  const codeManager = require("./code-manager");
  const codeBlocks = [];
  for (const selection of editor.getSelections()) {
    const codeBlock = codeManager.findCodeBlock(editor, selection);
    if (!codeBlock || codeBlock.code === null) {
      continue;
    }
    const { row, code: codeNullable } = codeBlock;
    const cellType = codeManager.getMetadataForRow(editor, new Point(row, 0));
    const code =
      cellType === "markdown"
        ? codeManager.removeCommentsMarkdownCell(editor, codeNullable)
        : codeNullable;
    codeBlocks.push({ code, row, cellType });
  }
  if (codeBlocks.length === 0) {
    return;
  }
  if (moveDown) {
    const lastRow = codeBlocks[codeBlocks.length - 1].row;
    codeManager.moveDown(editor, lastRow);
  }
  checkForKernel(store, async (kernel) => {
    const result = require("./result");
    if (codeBlocks.length === 1) {
      result.createResult(store, codeBlocks[0]);
      return;
    }
    kernel.startBatchExecution();
    try {
      for (const { code, row, cellType } of codeBlocks) {
        // Run blocks sequentially and stop at the first one that errors
        const success = await result.createResultAsync(store, { code, row, cellType });
        if (!success) {
          break;
        }
      }
    } finally {
      kernel.endBatchExecution();
    }
  });
}

function runAll(breakpoints, event = null) {
  if (!breakpoints && runAdapterCommand("all", false, event)) {
    return;
  }

  const { editor, grammar, filePath } = store;
  if (!editor || !grammar || !filePath) {
    return;
  }
  if (isMultilanguageGrammar(editor.getGrammar())) {
    atom.notifications.addError('"Run All" is not supported for this file type!');
    return;
  }
  checkForKernel(store, async (kernel) => {
    // https://github.com/nteract/hydrogen/issues/1452
    atom.commands.dispatch(editor.element, "autocomplete-plus:cancel");
    const codeManager = require("./code-manager");
    const result = require("./result");
    const cells = codeManager.getCells(editor, breakpoints);

    kernel.startBatchExecution();
    try {
      for (const cell of cells) {
        const { start, end } = cell;
        const codeNullable = codeManager.getTextInRange(editor, start, end);
        if (codeNullable === null) {
          continue;
        }
        const row = codeManager.escapeBlankRows(
          editor,
          start.row,
          codeManager.getEscapeBlankRowsEndRow(editor, end),
        );
        const cellType = codeManager.getMetadataForRow(editor, start);
        const code =
          cellType === "markdown"
            ? codeManager.removeCommentsMarkdownCell(editor, codeNullable)
            : codeNullable;
        // Run cells sequentially and stop at the first one that errors
        const success = await result.createResultAsync(store, { code, row, cellType });
        if (!success) {
          break;
        }
      }
    } finally {
      kernel.endBatchExecution();
    }
  });
}

function runAllAbove(event = null) {
  if (runAdapterCommand("above", false, event)) {
    return;
  }

  const { editor, grammar, filePath } = store;
  if (!editor || !grammar || !filePath) {
    return;
  }
  if (isMultilanguageGrammar(editor.getGrammar())) {
    atom.notifications.addError('"Run All Above" is not supported for this file type!');
    return;
  }
  checkForKernel(store, async (kernel) => {
    // https://github.com/nteract/hydrogen/issues/1452
    atom.commands.dispatch(editor.element, "autocomplete-plus:cancel");
    const codeManager = require("./code-manager");
    const result = require("./result");
    const cursor = editor.getCursorBufferPosition();
    const breakpoints = codeManager.getBreakpoints(editor);
    breakpoints.push(new Point(cursor.row + 1, 0));
    const cells = codeManager.getCells(editor, breakpoints);

    kernel.startBatchExecution();
    try {
      for (const cell of cells) {
        const { start, end } = cell;
        const codeNullable = codeManager.getTextInRange(editor, start, end);
        const row = codeManager.escapeBlankRows(
          editor,
          start.row,
          codeManager.getEscapeBlankRowsEndRow(editor, end),
        );
        const cellType = codeManager.getMetadataForRow(editor, start);
        if (codeNullable !== null) {
          const code =
            cellType === "markdown"
              ? codeManager.removeCommentsMarkdownCell(editor, codeNullable)
              : codeNullable;
          // Run cells sequentially and stop at the first one that errors
          const success = await result.createResultAsync(store, { code, row, cellType });
          if (!success) {
            break;
          }
        }
        if (cell.containsPoint(cursor)) {
          break;
        }
      }
    } finally {
      kernel.endBatchExecution();
    }
  });
}

function runCell(moveDown = false, event = null) {
  if (runAdapterCommand("active", moveDown, event)) {
    return;
  }

  const { editor, grammar, filePath } = store;
  if (!editor || !grammar || !filePath) {
    return;
  }
  // https://github.com/nteract/hydrogen/issues/1452
  atom.commands.dispatch(editor.element, "autocomplete-plus:cancel");
  // Capture cell before checkForKernel to avoid cursor movement during kernel selection
  const codeManager = require("./code-manager");
  const { start, end } = codeManager.getCurrentCell(editor);
  const codeNullable = codeManager.getTextInRange(editor, start, end);
  if (codeNullable === null) {
    return;
  }
  const row = codeManager.escapeBlankRows(
    editor,
    start.row,
    codeManager.getEscapeBlankRowsEndRow(editor, end),
  );
  const cellType = codeManager.getMetadataForRow(editor, start);
  const code =
    cellType === "markdown"
      ? codeManager.removeCommentsMarkdownCell(editor, codeNullable)
      : codeNullable;
  if (moveDown) {
    codeManager.moveDown(editor, row);
  }
  checkForKernel(store, () => {
    const result = require("./result");
    result.createResult(store, { code, row, cellType });
  });
}

function foldCurrentCell() {
  const editor = store.editor;
  if (!editor) {
    return;
  }
  require("./code-manager").foldCurrentCell(editor);
}

function foldAllButCurrentCell() {
  const editor = store.editor;
  if (!editor) {
    return;
  }
  require("./code-manager").foldAllButCurrentCell(editor);
}

function startAdapterLocalKernel(event = null) {
  const handled = require("./adapter-integration").startAdapterKernel(
    hydrogenAdapterServices,
    kernelManager,
  );
  if (handled) event?.stopPropagation?.();
  return handled;
}

async function refreshKernelPickerSpecs() {
  const kernelSpecs = await kernelManager.updateKernelSpecs(store.grammar, true);
  return store.grammar
    ? kernelSpecs.filter((kernelSpec) => kernelSpecProvidesGrammar(kernelSpec, store.grammar))
    : [];
}

function startZMQKernel(event = null) {
  if (startAdapterLocalKernel(event)) {
    return;
  }

  kernelManager.getAllKernelSpecsForGrammar(store.grammar).then((kernelSpecs) => {
    if (kernelPicker) {
      kernelPicker.kernelSpecs = kernelSpecs;
    } else {
      const KernelPicker = require("./kernel-picker");
      kernelPicker = new KernelPicker(kernelSpecs);
      kernelPicker.onConfirmed = (kernelSpec) => {
        const { editor, grammar, filePath, markers } = store;
        if (!editor || !grammar || !filePath || !markers) {
          return;
        }
        markers.clear();
        kernelManager.startKernel(kernelSpec, grammar, editor, filePath);
      };
    }
    kernelPicker.onUpdate = refreshKernelPickerSpecs;
    kernelPicker.toggle();
  });
}

function connectToWSKernel() {
  if (!wsKernelPicker) {
    const WSKernelPicker = require("./ws-kernel-picker");
    wsKernelPicker = new WSKernelPicker((transport) => {
      const Kernel = require("./kernel");
      const kernel = new Kernel(transport);
      const { editor, grammar, filePath, markers } = store;
      if (!editor || !grammar || !filePath || !markers) {
        return;
      }
      markers.clear();
      const ZMQKernel = require("./zmq-kernel");
      if (kernel.transport instanceof ZMQKernel) {
        kernel.destroy();
      }
      store.newKernel(kernel, filePath, editor, grammar);
    });
  }
  wsKernelPicker.toggle((kernelSpec) => kernelSpecProvidesGrammar(kernelSpec, store.grammar));
}

// Accepts store as an arg
function checkForKernel({ editor, grammar, filePath, kernel }, callback) {
  if (!filePath || !grammar) {
    return atom.notifications.addError(
      "The language grammar must be set in order to start a kernel. The easiest way to do this is to save the file.",
    );
  }
  if (kernel) {
    callback(kernel);
    return;
  }
  kernelManager.startKernelFor(grammar, editor, filePath, (newKernel) => callback(newKernel));
}

function restartKernel(onRestarted) {
  if (store.kernel) {
    store.kernel.restart(onRestarted);
  } else if (onRestarted) {
    // No kernel - call callback immediately
    onRestarted();
  }
}

function addWatch() {
  if (store.kernel) {
    store.kernel.watchesStore.addWatchFromEditor(store.editor);
    openOrShowDock(WATCHES_URI);
  }
}

function removeWatch(event) {
  const editor = event?.currentTarget?.getModel?.() || event?.target?.getModel?.();
  if (!editor) {
    return;
  }

  const kernels = store.kernel
    ? [store.kernel, ...store.runningKernels.filter((kernel) => kernel !== store.kernel)]
    : store.runningKernels;

  const removed = kernels.some((kernel) => kernel.watchesStore.removeWatchForEditor(editor));
  if (removed) openOrShowDock(WATCHES_URI);
}

async function updateKernels() {
  await kernelManager.updateKernelSpecs();
}

function debugToggle() {
  atom.config.set("hydrogen-next.debug", !atom.config.get("hydrogen-next.debug"));
}

async function toggleKernelMonitor() {
  atom.workspace.toggle(KERNEL_MONITOR_URI);
}

function exploreData() {
  // Find the focused editor. We look at the focused element first so this works
  // for embedded editors (e.g. jupyter-next notebook cells), which are not the
  // active pane item and so aren't returned by getActiveTextEditor().
  let editor = null;
  const focused =
    document.activeElement && document.activeElement.closest("atom-text-editor");
  if (focused && typeof focused.getModel === "function") {
    editor = focused.getModel();
  }
  if (!editor) {
    editor = atom.workspace.getActiveTextEditor();
  }
  if (!editor) {
    atom.notifications.addWarning("Data Explorer", {
      description: "No active editor to read an expression from.",
    });
    return;
  }
  let text = editor.getSelectedText();
  if (!text) {
    text = editor.getWordUnderCursor();
  }
  text = (text || "").trim();
  if (!text) {
    atom.notifications.addWarning("Data Explorer", {
      description: "Select an expression or place the cursor on a variable to explore.",
    });
    return;
  }

  const kernel = store.kernel;
  if (!kernel) {
    atom.notifications.addWarning("Data Explorer", {
      description: "No running kernel for the current file.",
    });
    return;
  }
  if (!kernel.language || kernel.language.toLowerCase() !== "python") {
    atom.notifications.addWarning("Data Explorer", {
      description: "Data Explorer only works with Python kernels.",
    });
    return;
  }

  require("./store/data-explorer-store").default.load(kernel, text);
  openInCenter(DATA_EXPLORER_URI);
}

function toggleExecPanel() {
  if (!execPanel) {
    execPanel = new ExecPanel(store);
  }
  execPanel.toggle();
}

export function getExecPanel() {
  if (!execPanel) {
    execPanel = new ExecPanel(store);
  }
  return execPanel;
}

function clearAndRestart() {
  let editor = store.editor;
  if (!editor) {
    return;
  }
  clearAndCenter();
  restartKernel();
}

function clearAndCenter() {
  let editor = store.editor;
  if (!editor) {
    return;
  }
  clearResults();
  editor.scrollToCursorPosition();
}

function recalculateAll() {
  let editor = store.editor;
  if (!editor) {
    return;
  }
  clearAndCenter();
  restartKernel(() => {
    runAll();
  });
}

function recalculateAllAbove() {
  let editor = store.editor;
  if (!editor) {
    return;
  }
  clearAndCenter();
  restartKernel(() => {
    runAllAbove();
  });
}

function runAllInline(event = null) {
  if (runAdapterCommand("all", false, event)) {
    return;
  }

  const { editor, grammar, filePath } = store;
  if (!editor || !grammar || !filePath) {
    return;
  }
  checkForKernel(store, async (kernel) => {
    atom.commands.dispatch(editor.element, "autocomplete-plus:cancel");
    const codeManager = require("./code-manager");
    const result = require("./result");
    const lastRow = editor.getLastBufferRow();

    kernel.startBatchExecution();
    try {
      for (let currentRow = 0; currentRow <= lastRow; ) {
        const codeBlock = codeManager.findCodeBlockAtRow(editor, currentRow);

        if (!codeBlock || codeBlock.code === null) {
          currentRow++;
          continue;
        }

        const { code, row } = codeBlock;
        const cellType = codeManager.getMetadataForRow(editor, new Point(row, 0));
        const processedCode =
          cellType === "markdown" ? codeManager.removeCommentsMarkdownCell(editor, code) : code;

        editor.setCursorBufferPosition([row, 0], { autoscroll: false });

        const success = await result.createResultAsync(store, {
          code: processedCode,
          row,
          cellType,
        });

        if (!success) {
          break;
        }

        // Skip to next non-blank row after this block
        currentRow = row + 1;
        while (currentRow <= lastRow && codeManager.isBlank(editor, currentRow)) {
          currentRow++;
        }
      }
    } finally {
      kernel.endBatchExecution();
    }
  });
}

function recalculateAllInline() {
  let editor = store.editor;
  if (!editor) {
    return;
  }
  clearAndCenter();
  restartKernel(() => {
    runAllInline();
  });
}

function runAllAboveInline(event = null) {
  if (runAdapterCommand("above", false, event)) {
    return;
  }

  const { editor, grammar, filePath } = store;
  if (!editor || !grammar || !filePath) {
    return;
  }
  checkForKernel(store, async (kernel) => {
    atom.commands.dispatch(editor.element, "autocomplete-plus:cancel");
    const codeManager = require("./code-manager");
    const result = require("./result");
    const targetRow = editor.getCursorBufferPosition().row;

    kernel.startBatchExecution();
    try {
      for (let currentRow = 0; currentRow <= targetRow; ) {
        const codeBlock = codeManager.findCodeBlockAtRow(editor, currentRow);

        if (!codeBlock || codeBlock.code === null) {
          currentRow++;
          continue;
        }

        const { code, row } = codeBlock;
        // Skip blocks that end after target row
        if (row > targetRow) {
          break;
        }

        const cellType = codeManager.getMetadataForRow(editor, new Point(row, 0));
        const processedCode =
          cellType === "markdown" ? codeManager.removeCommentsMarkdownCell(editor, code) : code;

        editor.setCursorBufferPosition([row, 0], { autoscroll: false });

        const success = await result.createResultAsync(store, {
          code: processedCode,
          row,
          cellType,
        });

        if (!success) {
          break;
        }

        // Skip to next non-blank row after this block
        currentRow = row + 1;
        while (currentRow <= targetRow && codeManager.isBlank(editor, currentRow)) {
          currentRow++;
        }
      }
    } finally {
      kernel.endBatchExecution();
    }
  });
}

function recalculateAllAboveInline() {
  let editor = store.editor;
  if (!editor) {
    return;
  }
  clearAndCenter();
  restartKernel(() => {
    runAllAboveInline();
  });
}

function runAllBelowInline(event = null) {
  if (runAdapterCommand("below", false, event)) {
    return;
  }

  const { editor, grammar, filePath } = store;
  if (!editor || !grammar || !filePath) {
    return;
  }
  checkForKernel(store, async (kernel) => {
    atom.commands.dispatch(editor.element, "autocomplete-plus:cancel");
    const codeManager = require("./code-manager");
    const result = require("./result");
    const lastRow = editor.getLastBufferRow();

    kernel.startBatchExecution();
    try {
      for (let currentRow = editor.getCursorBufferPosition().row; currentRow <= lastRow; ) {
        const codeBlock = codeManager.findCodeBlockAtRow(editor, currentRow);

        if (!codeBlock || codeBlock.code === null) {
          currentRow++;
          continue;
        }

        const { code, row } = codeBlock;
        const cellType = codeManager.getMetadataForRow(editor, new Point(row, 0));
        const processedCode =
          cellType === "markdown" ? codeManager.removeCommentsMarkdownCell(editor, code) : code;

        editor.setCursorBufferPosition([row, 0], { autoscroll: false });

        const success = await result.createResultAsync(store, {
          code: processedCode,
          row,
          cellType,
        });

        if (!success) {
          break;
        }

        // Skip to next non-blank row after this block
        currentRow = row + 1;
        while (currentRow <= lastRow && codeManager.isBlank(editor, currentRow)) {
          currentRow++;
        }
      }
    } finally {
      kernel.endBatchExecution();
    }
  });
}

function openExamples() {
  atom.open({ pathsToOpen: __dirname + "/../examples" });
}

function shutdownAllKernels() {
  for (let kernel of store.runningKernels) {
    kernel.shutdown();
    kernel.destroy();
  }
}

function attachResultToClaude() {
  if (!claudeChatService) {
    atom.notifications.addWarning("Claude Chat is not available");
    return;
  }

  const kernel = store.kernel;
  if (!kernel || !kernel.outputStore) {
    atom.notifications.addWarning("No kernel output available");
    return;
  }

  const outputStore = kernel.outputStore;
  const outputs = outputStore.outputs;
  const lastCode = outputStore.lastCode;

  if ((!outputs || outputs.length === 0) && !lastCode) {
    atom.notifications.addWarning("No content to attach");
    return;
  }

  // Get last output and extract text content
  let outputText = "";
  if (outputs && outputs.length > 0) {
    const lastOutput = outputs[outputs.length - 1];
    if (lastOutput.data) {
      outputText =
        lastOutput.data["text/plain"] ||
        lastOutput.data["text/html"] ||
        lastOutput.data["text/markdown"] ||
        JSON.stringify(lastOutput.data);
    } else if (lastOutput.text) {
      outputText = lastOutput.text;
    } else if (lastOutput.traceback) {
      outputText = lastOutput.traceback.join("\n");
    }
  }

  // Build formatted content with file, input, and output
  const parts = [];
  const filePath = store.filePath;

  if (filePath && !filePath.startsWith("Unsaved")) {
    parts.push(`File: ${filePath}`);
  }

  if (lastCode) {
    parts.push(`Input:\n${lastCode}`);
  }

  if (outputText) {
    parts.push(`Output:\n${outputText}`);
  }

  const content = parts.join("\n\n");
  if (!content) {
    atom.notifications.addWarning("No text content to attach");
    return;
  }

  const lines = content.split(/\r\n|\r|\n/);
  const lastLine = lines[lines.length - 1] || "";
  const sourcePath =
    filePath && !filePath.startsWith("Unsaved") ? filePath : kernel.language || "output";

  claudeChatService.setAttachContext({
    type: "selections",
    path: sourcePath,
    line: 1,
    selections: [
      {
        text: content,
        range: {
          start: { row: 0, column: 0 },
          end: { row: lines.length - 1, column: lastLine.length },
        },
      },
    ],
    label: `${kernel.displayName} result`,
    icon: "terminal",
  });
}
