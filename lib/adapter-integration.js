/** @babel */

import store from "./store";
import MarkerStore from "./store/markers";
import inspectorStore from "./store/inspector-store";
import { kernelSpecProvidesGrammar, terminateEditorPendingState } from "./utils";

const PERSISTABLE_OUTPUT_TYPES = new Set(["execute_result", "display_data", "stream", "error"]);

const markerStores = new Map();
const unsavedItemKeys = new WeakMap();
const adapterPathKeys = new WeakMap();
const adapterPathSubscriptions = new WeakMap();
const runningAdapterTargets = new Map();
let nextUnsavedItemId = 1;
let adapterKernelPicker = null;

function getActiveAdapter(adapterServices) {
  const services = Array.isArray(adapterServices)
    ? adapterServices
    : adapterServices
      ? [adapterServices]
      : [];
  const activeItem = atom.workspace.getCenter().getActivePaneItem();

  for (const service of services) {
    const adapter =
      service.getActiveAdapter?.() ||
      (service.handlesItem?.(activeItem) ? service.getAdapterForItem?.(activeItem) : null);
    if (adapter) {
      observeAdapterPath(adapter);
      return adapter;
    }
  }

  return null;
}

function getAdapterKey(adapter) {
  const paneItem = adapter.getPaneItem?.();
  const adapterId = adapter.getAdapterId?.();
  const path = adapter.getPath?.();
  if (path) {
    const previousKey = paneItem ? adapterPathKeys.get(paneItem) : null;
    if (previousKey && previousKey !== path) {
      store.remapKernelKey(previousKey, path);
    }
    if (paneItem) adapterPathKeys.set(paneItem, path);
    return path;
  }

  if (paneItem && typeof paneItem === "object") {
    if (!unsavedItemKeys.has(paneItem)) {
      unsavedItemKeys.set(paneItem, adapterId || `Unsaved Adapter ${nextUnsavedItemId++}`);
    }
    const key = adapterPathKeys.get(paneItem) || unsavedItemKeys.get(paneItem);
    adapterPathKeys.set(paneItem, key);
    return key;
  }

  if (adapterId) return adapterId;

  return `Unsaved Adapter ${nextUnsavedItemId++}`;
}

function observeAdapterPath(adapter) {
  const paneItem = adapter.getPaneItem?.();
  if (!paneItem || adapterPathSubscriptions.has(paneItem)) return;

  const subscribe = adapter.onDidChangePath || paneItem.onDidChangePath;
  if (typeof subscribe !== "function") return;

  adapterPathKeys.set(paneItem, getAdapterKey(adapter));
  const subscriber = adapter.onDidChangePath ? adapter : paneItem;
  const disposable = subscribe.call(subscriber, (newPath) => {
    if (!newPath) return;
    const previousKey = adapterPathKeys.get(paneItem);
    if (previousKey && previousKey !== newPath) {
      store.remapKernelKey(previousKey, newPath);
    }
    adapterPathKeys.set(paneItem, newPath);
  });

  adapterPathSubscriptions.set(paneItem, disposable);
  paneItem.onDidDestroy?.(() => {
    disposable?.dispose?.();
    adapterPathSubscriptions.delete(paneItem);
    adapterPathKeys.delete(paneItem);
  });
}

function getAdapterTitle(adapter, paneItem, filePath) {
  return (
    adapter.getTitle?.() ||
    paneItem?.getTitle?.() ||
    (filePath ? String(filePath).split(/[\\/]/).pop() : "")
  );
}

function getAdapterContext(adapter) {
  const paneItem = adapter.getPaneItem?.() || null;
  const filePath = getAdapterKey(adapter);
  return {
    filePath,
    title: getAdapterTitle(adapter, paneItem, filePath),
    paneItem,
  };
}

function getMarkerStore(editor) {
  if (!editor) return null;
  const key = editor.id || editor;
  if (!markerStores.has(key)) {
    markerStores.set(key, new MarkerStore());
    editor.onDidDestroy?.(() => {
      markerStores.get(key)?.clear();
      markerStores.delete(key);
    });
  }
  return markerStores.get(key);
}

function getExistingMarkerStore(editor) {
  if (!editor) return null;
  return markerStores.get(editor.id || editor) || null;
}

function getMappedKernel(filePath, grammar) {
  if (!filePath) return null;
  const kernelOrMap = store.kernelMapping.get(filePath);
  if (!kernelOrMap) return null;
  if (!grammar && typeof kernelOrMap.values === "function") {
    return kernelOrMap.values().next().value || null;
  }
  if (!grammar) return kernelOrMap;
  if (typeof kernelOrMap.get === "function") {
    return kernelOrMap.get(grammar.name) || null;
  }
  return kernelOrMap;
}

async function getPreferredKernelSpec(kernelManager, adapter, grammar) {
  const metadata = adapter.getMetadata?.() || {};
  const kernelspec = metadata.kernelspec || {};
  const preferred = [kernelspec.name, kernelspec.display_name].filter(Boolean);
  if (preferred.length === 0) return null;

  const kernelSpecs = await kernelManager.getAllKernelSpecsForGrammar(grammar);
  return (
    kernelSpecs.find((spec) => preferred.includes(spec.name)) ||
    kernelSpecs.find((spec) => preferred.includes(spec.display_name)) ||
    null
  );
}

function checkForAdapterKernel(kernelManager, adapter, grammar, editor, callback) {
  const filePath = getAdapterKey(adapter);
  if (!filePath || !grammar) {
    atom.notifications.addError(
      "The runnable target language grammar must be set before starting a kernel.",
    );
    return;
  }

  const existingKernel = getMappedKernel(filePath, grammar);
  if (existingKernel) {
    store.setExternalKernel(existingKernel, getAdapterContext(adapter));
    callback(existingKernel);
    return;
  }

  getPreferredKernelSpec(kernelManager, adapter, grammar)
    .then((kernelSpec) => {
      if (kernelSpec) {
        kernelManager.startKernel(kernelSpec, grammar, editor, filePath, (kernel) => {
          store.setExternalKernel(kernel, getAdapterContext(adapter));
          callback(kernel);
        });
      } else {
        kernelManager.startKernelFor(grammar, editor, filePath, (kernel) => {
          store.setExternalKernel(kernel, getAdapterContext(adapter));
          callback(kernel);
        });
      }
    })
    .catch((error) => {
      atom.notifications.addError("Failed to start adapter kernel", {
        description: error.message || String(error),
        dismissable: true,
      });
    });
}

function persistTargetResult(adapter, target, result) {
  if (!result) return;

  if (result.stream === "execution_count") {
    adapter.setTargetExecutionCount?.(target, result.data);
    return;
  }

  if (result.stream === "status" || result.output_type === "status") {
    return;
  }

  if (result.output_type === "execute_input") {
    if (result.execution_count != null) {
      adapter.setTargetExecutionCount?.(target, result.execution_count);
    }
    return;
  }

  if (PERSISTABLE_OUTPUT_TYPES.has(result.output_type) || result.output_type === "clear_output") {
    adapter.appendTargetOutput?.(target, result);
  }
}

function isExecutableTarget(target) {
  if (!target) return false;
  if (target.executable === false) return false;
  if (target.type === "markdown" || target.type === "raw") return false;
  return true;
}

function targetRecordId(target) {
  return String(target?.id ?? target?.index ?? "");
}

function registerRunningTarget(adapter, kernel, target) {
  const adapterKey = getAdapterKey(adapter);
  const targetId = targetRecordId(target);
  if (!targetId) return null;

  if (!runningAdapterTargets.has(adapterKey)) {
    runningAdapterTargets.set(adapterKey, new Map());
  }

  let cancelExecution;
  const cancellation = new Promise((resolve) => {
    cancelExecution = (reason = "cancelled") => resolve({ cancelled: true, reason });
  });
  const record = {
    adapter,
    kernel,
    target,
    cancellation,
    cancelExecution,
    cancelReason: null,
  };
  runningAdapterTargets.get(adapterKey).set(targetId, record);
  adapter.beginTargetExecution?.(target, { kernel });
  return record;
}

function finishRunningTarget(record, result) {
  if (!record) return;

  const adapterKey = getAdapterKey(record.adapter);
  const targetId = targetRecordId(record.target);
  runningAdapterTargets.get(adapterKey)?.delete(targetId);
  if (runningAdapterTargets.get(adapterKey)?.size === 0) {
    runningAdapterTargets.delete(adapterKey);
  }

  if (result.status === "cancelled") {
    record.adapter.cancelTargetExecution?.(record.target, result);
  } else if (result.status === "failed") {
    record.adapter.failTargetExecution?.(record.target, result);
  } else if (result.status === "skipped") {
    record.adapter.skipTargetExecution?.(record.target, result);
  }

  record.adapter.finishTargetExecution?.(record.target, result);
}

function cancelAdapterTargets(adapter, kernel, reason) {
  const records = runningAdapterTargets.get(getAdapterKey(adapter));
  if (!records) return;

  for (const record of records.values()) {
    if (kernel && record.kernel !== kernel) continue;
    record.cancelReason = reason;
    record.cancelExecution(reason);
  }
}

function getRunTargets(adapter, scope) {
  const targets = adapter.getRunTargets?.(scope) || [];
  if (targets.length > 0 || scope !== "selected") {
    return targets;
  }
  const target = adapter.getRunTarget?.(adapter.getActiveTargetId?.());
  return target ? [target] : [];
}

function getEditorRunTargets(adapter, moveDown) {
  const baseTarget = adapter.getRunTarget?.(adapter.getActiveTargetId?.());
  const editor = baseTarget?.editor;
  if (!baseTarget || !editor) return [];
  if (baseTarget.type && baseTarget.type !== "code") {
    return [
      {
        ...baseTarget,
        source: "",
        row: baseTarget.row || 0,
      },
    ];
  }

  const codeManager = require("./code-manager");
  const targets = [];

  for (const selection of editor.getSelections()) {
    const codeBlock = codeManager.findCodeBlock(editor, selection);
    if (!codeBlock || codeBlock.code === null) continue;

    targets.push({
      ...baseTarget,
      source: codeBlock.code,
      row: codeBlock.row,
    });
  }

  if (moveDown && targets.length > 0) {
    codeManager.moveDown(editor, targets[targets.length - 1].row);
  }

  return targets;
}

function getAdapterKernelTarget(adapter) {
  const activeTargetId = adapter.getActiveTargetId?.();
  return (
    adapter.getKernelTarget?.(activeTargetId) ||
    adapter.getRunTarget?.(activeTargetId) ||
    adapter.getRunTargets?.("all")?.[0] ||
    null
  );
}

function focusNextAdapterTarget(adapter, target) {
  if (!target) return;
  const nextTarget =
    adapter.getNextRunTarget?.(target) ||
    (typeof target.id === "number" ? adapter.getRunTarget?.(target.id + 1) : null);
  if (nextTarget) {
    adapter.focusTarget?.(nextTarget);
  }
}

function shouldUpdateActiveTargetForRun(scope) {
  return scope === "active" || scope === "editor";
}

export function runAdapterTargets(
  adapterService,
  kernelManager,
  { scope = "selected", moveDown = false } = {},
) {
  const adapter = getActiveAdapter(adapterService);
  if (!adapter) return false;

  const targets =
    scope === "editor" ? getEditorRunTargets(adapter, moveDown) : getRunTargets(adapter, scope);
  const executableTargets = targets.filter(isExecutableTarget);
  if (targets.length === 0 || executableTargets.length === 0) {
    const activeTarget = adapter.getRunTarget?.(adapter.getActiveTargetId?.());
    const kernelTarget = getAdapterKernelTarget(adapter);
    const kernelEditor = kernelTarget?.editor;
    const kernelGrammar = kernelTarget?.grammar || kernelEditor?.getGrammar?.();
    if (targets.length === 0 && kernelEditor && kernelGrammar) {
      terminateEditorPendingState(kernelEditor);
      checkForAdapterKernel(kernelManager, adapter, kernelGrammar, kernelEditor, () => {});
    }
    if (targets.length > 0) {
      for (const target of targets) {
        adapter.skipTargetExecution?.(target, { reason: "not-executable" });
        adapter.finishTargetExecution?.(target, {
          success: true,
          status: "skipped",
          reason: "not-executable",
        });
      }
    }
    if (moveDown && activeTarget) {
      focusNextAdapterTarget(adapter, activeTarget);
    }
    return true;
  }
  const persistResults = scope !== "editor";

  const firstTarget = executableTargets[0];
  const firstEditor = firstTarget.editor;
  const grammar = firstTarget.grammar || firstEditor?.getGrammar?.();
  if (!firstEditor || !grammar) return true;
  const shouldUpdateActiveTarget = shouldUpdateActiveTargetForRun(scope);

  checkForAdapterKernel(kernelManager, adapter, grammar, firstEditor, async (kernel) => {
    const result = require("./result");

    kernel.startBatchExecution();
    const clearedTargets = new Set();
    try {
      for (const target of targets) {
        if (!isExecutableTarget(target)) {
          adapter.skipTargetExecution?.(target, { reason: "not-executable" });
          adapter.finishTargetExecution?.(target, {
            success: true,
            status: "skipped",
            reason: "not-executable",
          });
          continue;
        }

        const editor = target.editor;
        if (!editor) continue;
        terminateEditorPendingState(editor);

        const targetGrammar = target.grammar || editor.getGrammar?.() || grammar;
        const filePath = getAdapterKey(adapter);
        const mappedKernel = getMappedKernel(filePath, targetGrammar) || kernel;
        const markers = getMarkerStore(editor);
        const code = target.source || "";
        const row = target.row == null ? Math.max(0, editor.getLastBufferRow?.() || 0) : target.row;

        if (shouldUpdateActiveTarget) {
          adapter.setActiveTargetId?.(target.id);
        }
        if (persistResults && !clearedTargets.has(target.id)) {
          adapter.clearTargetOutputs?.(target);
          clearedTargets.add(target.id);
        }
        atom.commands.dispatch(editor.element, "autocomplete-plus:cancel");
        store.updateEditor(editor);
        store.setExternalKernel(mappedKernel, getAdapterContext(adapter));

        let success = false;
        let status = "error";
        let executionPromise = null;
        const runningTarget = registerRunningTarget(adapter, mappedKernel, target);
        try {
          executionPromise = result.createResultAsync(
            { editor, kernel: mappedKernel, markers },
            {
              code,
              row,
              cellType: "codecell",
              inline: !persistResults,
              onResult: persistResults
                ? (kernelResult) => persistTargetResult(adapter, target, kernelResult)
                : null,
            },
          );
          if (moveDown && scope !== "editor" && target === targets[targets.length - 1]) {
            focusNextAdapterTarget(adapter, target);
          }
          const executionResult = runningTarget
            ? await Promise.race([executionPromise, runningTarget.cancellation])
            : await executionPromise;
          if (executionResult?.cancelled) {
            success = false;
            status = "cancelled";
          } else {
            success = executionResult === true;
            status = success ? "ok" : "error";
          }
        } catch (error) {
          success = false;
          status = "failed";
          atom.notifications.addError("Notebook cell execution failed", {
            description: error.message || String(error),
            dismissable: true,
          });
        } finally {
          const finishResult = {
            kernel: mappedKernel,
            lastExecutionTime: mappedKernel.lastExecutionTime,
            success,
            status,
          };
          if (runningTarget) {
            finishRunningTarget(runningTarget, finishResult);
          } else {
            adapter.finishTargetExecution?.(target, finishResult);
          }
        }

        if (!success) break;
      }
    } finally {
      kernel.endBatchExecution();
    }
  });

  return true;
}

/**
 * "Start Local Kernel" for adapter editors (e.g. jupyter-next notebooks):
 * show the kernel picker, start the selected kernel keyed to the notebook
 * path so subsequent runs use it, replace (shut down) the previously mapped
 * kernel, and persist the new kernelspec into the notebook metadata.
 * Returns true when an adapter editor is active (handled).
 */
export function startAdapterKernel(adapterService, kernelManager) {
  const adapter = getActiveAdapter(adapterService);
  if (!adapter) return false;

  const target = getAdapterKernelTarget(adapter);
  const editor = target?.editor;
  const grammar = target?.grammar || editor?.getGrammar?.();
  if (!editor || !grammar) {
    atom.notifications.addError(
      "The runnable target language grammar must be set before starting a kernel.",
    );
    return true;
  }

  kernelManager.getAllKernelSpecsForGrammar(grammar).then((kernelSpecs) => {
    if (adapterKernelPicker) {
      adapterKernelPicker.kernelSpecs = kernelSpecs;
    } else {
      const KernelPicker = require("./kernel-picker");
      adapterKernelPicker = new KernelPicker(kernelSpecs);
    }
    adapterKernelPicker.onUpdate = async () => {
      const updatedKernelSpecs = await kernelManager.updateKernelSpecs(grammar, true);
      return updatedKernelSpecs.filter((spec) => kernelSpecProvidesGrammar(spec, grammar));
    };

    adapterKernelPicker.onConfirmed = (kernelSpec) => {
      const filePath = getAdapterKey(adapter);
      const previousKernel = getMappedKernel(filePath, grammar);
      kernelManager.startKernel(kernelSpec, grammar, editor, filePath, (kernel) => {
        // The new kernel has taken over the notebook mapping; shut the old
        // one down once no other file is mapped to it.
        if (
          previousKernel &&
          previousKernel !== kernel &&
          store.getFilesForKernel(previousKernel).length === 0
        ) {
          previousKernel.shutdown();
          previousKernel.destroy();
        }
        store.setExternalKernel(kernel, getAdapterContext(adapter));
        adapter.setKernelSpec?.(kernelSpec);
      });
    };

    adapterKernelPicker.toggle();
  });

  return true;
}

export function handleAdapterKernelCommand(adapterService, command) {
  const adapter = getActiveAdapter(adapterService);
  if (!adapter) return false;

  const activeTarget = getAdapterKernelTarget(adapter);
  const editor = activeTarget?.editor;
  const grammar = activeTarget?.grammar || editor?.getGrammar?.();
  const kernel = getMappedKernel(getAdapterKey(adapter), grammar);

  if (!kernel) {
    atom.notifications.addError("No running kernel for adapter target found");
    return true;
  }

  store.setExternalKernel(kernel, getAdapterContext(adapter));

  if (command === "interrupt-kernel") {
    cancelAdapterTargets(adapter, kernel, "interrupted");
    kernel.interrupt();
  } else if (command === "restart-kernel") {
    cancelAdapterTargets(adapter, kernel, "restarted");
    kernel.restart();
  } else if (command === "shutdown-kernel") {
    cancelAdapterTargets(adapter, kernel, "shutdown");
    kernel.shutdown();
    kernel.destroy();
  }

  return true;
}

export function clearAdapterResults(adapterService) {
  const adapter = getActiveAdapter(adapterService);
  if (!adapter) return false;

  const targets = adapter.getRunTargets?.("all") || [];
  const fallbackTarget = adapter.getRunTarget?.(adapter.getActiveTargetId?.());
  const editors = new Set(
    (targets.length > 0 ? targets : fallbackTarget ? [fallbackTarget] : [])
      .map((target) => target.editor)
      .filter(Boolean),
  );

  for (const editor of editors) {
    getExistingMarkerStore(editor)?.clear();
  }

  return true;
}

export function setAdapterInspector(adapterService) {
  const adapter = getActiveAdapter(adapterService);
  if (!adapter) return false;

  const target = getAdapterKernelTarget(adapter);
  const editor = target?.editor;
  const grammar = target?.grammar || editor?.getGrammar?.();
  const kernel = getMappedKernel(getAdapterKey(adapter), grammar);

  if (!editor || !kernel) {
    inspectorStore.setError("No kernel running!");
    return true;
  }

  store.setExternalKernel(kernel, getAdapterContext(adapter));
  const { getExpressionAtCursor } = require("./code-manager");
  const code = getExpressionAtCursor(editor);
  if (!code) {
    inspectorStore.setError("No code to introspect!");
    return true;
  }

  inspectorStore.load(kernel, code);

  return true;
}
