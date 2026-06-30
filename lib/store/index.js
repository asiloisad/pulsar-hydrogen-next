/** @babel */

import { CompositeDisposable, File } from "atom";
import { observable, computed, action, keys, makeObservable } from "mobx";
import { isMultilanguageGrammar, getEmbeddedScope, isUnsavedFilePath } from "../utils";
import * as codeManager from "../code-manager";
import MarkerStore from "./markers";
import Kernel from "../kernel";
import dataExplorerStore from "./data-explorer-store";
import inspectorStore from "./inspector-store";

const DATA_EXPLORER_URI = "atom://hydrogen/data-explorer";
const INSPECTOR_URI = "atom://hydrogen/inspector";

export class Store {
  subscriptions = new CompositeDisposable();
  markersMapping = new Map();
  runningKernels = [];
  kernelMapping = new Map();
  startingKernels = new Map();
  editor = atom.workspace.getActiveTextEditor();
  activePaneItem = atom.workspace.getCenter().getActivePaneItem();
  grammar;
  configMapping = new Map();
  globalMode = Boolean(atom.config.get("hydrogen-next.globalMode"));
  // Allow external packages (like jupyter-next) to set the current kernel directly
  _externalKernel = null;
  _externalKernelContext = null;

  constructor() {
    makeObservable(this, {
      markersMapping: observable,
      runningKernels: observable,
      kernelMapping: observable,
      startingKernels: observable,
      editor: observable,
      activePaneItem: observable,
      grammar: observable,
      configMapping: observable,
      _externalKernel: observable,
      _externalKernelContext: observable,
      kernel: computed,
      filePath: computed,
      filePaths: computed,
      notebook: computed,
      markers: computed,
      newMarkerStore: action,
      startKernel: action,
      newKernel: action,
      remapKernelKey: action,
      deleteKernel: action,
      dispose: action,
      updateEditor: action,
      updateActivePaneItem: action,
      setGrammar: action,
      setConfigValue: action,
      setExternalKernel: action,
    });
  }

  get kernel() {
    // When the Data Explorer pane is the active center item, report the kernel
    // it is bound to, so the status bar (and other consumers) reflect the data
    // being shown rather than the last focused editor's kernel.
    const activeItem = this.activePaneItem;
    if (
      activeItem &&
      typeof activeItem.getURI === "function" &&
      activeItem.getURI() === DATA_EXPLORER_URI
    ) {
      return dataExplorerStore.kernel || null;
    }
    if (
      activeItem &&
      typeof activeItem.getURI === "function" &&
      activeItem.getURI() === INSPECTOR_URI
    ) {
      return inspectorStore.kernel || null;
    }

    // External kernel takes priority (set by jupyter-next or other packages).
    // Honor it only while it is still running and its context matches; a stale
    // reference is cleared in deleteKernel (a computed must stay side-effect free).
    if (
      this._externalKernel &&
      this.runningKernels.includes(this._externalKernel) &&
      this._externalKernelContextMatches()
    ) {
      return this._externalKernel;
    }

    // The status bar (and other consumers) must follow the active center pane
    // item, not the sticky editor reference. The editor is kept sticky when
    // focus moves to a non-editor center item (e.g. a dock) so those docks keep
    // working, but when the active center item is a different document (e.g. a
    // Jupyter notebook handled by an adapter) we must resolve that item's own
    // kernel, never the sticky editor's.
    if (!this._activePaneItemIsTextEditor()) {
      return this._kernelForActiveItemPath();
    }

    if (!this.grammar || !this.editor) {
      return null;
    }

    if (this.globalMode) {
      const currentScopeName = this.grammar.scopeName;
      return this.runningKernels.find((k) => k.grammar.scopeName === currentScopeName);
    }

    const file = this.filePath;
    if (!file) {
      return null;
    }
    const kernelOrMap = this.kernelMapping.get(file);
    if (!kernelOrMap) {
      return null;
    }
    if (kernelOrMap instanceof Kernel) {
      return kernelOrMap;
    }
    return this.grammar && this.grammar.name ? kernelOrMap.get(this.grammar.name) : null;
  }

  get filePath() {
    const editor = this.editor;
    if (!editor) {
      return null;
    }
    const savedFilePath = editor.getPath();
    return savedFilePath ? savedFilePath : `Unsaved Editor ${editor.id}`;
  }

  get filePaths() {
    return keys(this.kernelMapping);
  }

  get notebook() {
    const editor = this.editor;
    if (!editor) {
      return null;
    }
    const commutable = require("@nteract/commutable");
    let notebook = commutable.emptyNotebook;

    if (this.kernel) {
      notebook = notebook.setIn(["metadata", "kernelspec"], this.kernel.transport.kernelSpec);
    }

    const cellRanges = codeManager.getCells(editor);

    cellRanges.forEach((cell) => {
      const { start, end } = cell;
      let source = codeManager.getTextInRange(editor, start, end);
      source = source ? source : "";
      // When the cell marker following a given cell range is on its own line,
      // the newline immediately preceding that cell marker is included in
      // `source`. We remove that here. See #1512 for more details.
      if (source.slice(-1) === "\n") {
        source = source.slice(0, -1);
      }
      const cellType = codeManager.getMetadataForRow(editor, start);
      let newCell;

      if (cellType === "codecell") {
        newCell = commutable.emptyCodeCell.set("source", source);
      } else if (cellType === "markdown") {
        source = codeManager.removeCommentsMarkdownCell(editor, source);
        newCell = commutable.emptyMarkdownCell.set("source", source);
      }

      notebook = commutable.appendCellToNotebook(notebook, newCell);
    });

    return commutable.toJS(notebook);
  }

  get markers() {
    const editor = this.editor;
    if (!editor) {
      return null;
    }
    const markerStore = this.markersMapping.get(editor.id);
    return markerStore ? markerStore : this.newMarkerStore(editor.id);
  }

  newMarkerStore(editorId) {
    const markerStore = new MarkerStore();
    this.markersMapping.set(editorId, markerStore);
    return markerStore;
  }

  startKernel(kernelDisplayName) {
    this.startingKernels.set(kernelDisplayName, true);
  }

  addFileDisposer(editor, filePath) {
    const fileDisposer = new CompositeDisposable();

    if (isUnsavedFilePath(filePath)) {
      fileDisposer.add(
        editor.onDidSave((event) => {
          fileDisposer.dispose();
          this.addFileDisposer(editor, event.path); // Add another `fileDisposer` once it's saved
        }),
      );
      fileDisposer.add(
        editor.onDidDestroy(() => {
          this.kernelMapping.delete(filePath);
          fileDisposer.dispose();
        }),
      );
    } else {
      const file = new File(filePath);
      fileDisposer.add(
        file.onDidDelete(() => {
          this.kernelMapping.delete(filePath);
          fileDisposer.dispose();
        }),
      );
    }

    this.subscriptions.add(fileDisposer);
  }

  newKernel(kernel, filePath, editor, grammar) {
    if (isMultilanguageGrammar(editor.getGrammar())) {
      if (!this.kernelMapping.has(filePath)) {
        this.kernelMapping.set(filePath, new Map());
      }
      const multiLanguageMap = this.kernelMapping.get(filePath);
      if (multiLanguageMap && typeof multiLanguageMap.set === "function") {
        multiLanguageMap.set(grammar.name, kernel);
      }
    } else {
      this.kernelMapping.set(filePath, kernel);
    }

    this.addFileDisposer(editor, filePath);
    const index = this.runningKernels.findIndex((k) => k === kernel);

    if (index === -1) {
      this.runningKernels.push(kernel);
    }

    // delete startingKernel since store.kernel now in place to prevent duplicate kernel
    this.startingKernels.delete(kernel.kernelSpec.display_name);
  }

  remapKernelKey(oldKey, newKey) {
    if (!oldKey || !newKey || oldKey === newKey || !this.kernelMapping.has(oldKey)) {
      return;
    }

    const existing = this.kernelMapping.get(newKey);
    const incoming = this.kernelMapping.get(oldKey);
    if (existing instanceof Kernel && incoming instanceof Kernel) {
      this.kernelMapping.set(newKey, incoming);
    } else if (existing && typeof existing.set === "function" && incoming) {
      if (incoming instanceof Kernel) {
        existing.set(incoming.grammar.name, incoming);
      } else if (typeof incoming.forEach === "function") {
        incoming.forEach((kernel, grammarName) => existing.set(grammarName, kernel));
      }
    } else {
      this.kernelMapping.set(newKey, incoming);
    }
    this.kernelMapping.delete(oldKey);

    if (this._externalKernelContext?.filePath === oldKey) {
      this._externalKernelContext = {
        ...this._externalKernelContext,
        filePath: newKey,
      };
    }
  }

  deleteKernel(kernel) {
    const grammar = kernel.grammar.name;
    const files = this.getFilesForKernel(kernel);
    files.forEach((file) => {
      const kernelOrMap = this.kernelMapping.get(file);
      if (!kernelOrMap) {
        return;
      }

      if (kernelOrMap instanceof Kernel) {
        this.kernelMapping.delete(file);
      } else {
        kernelOrMap.delete(grammar);
      }
    });
    this.runningKernels = this.runningKernels.filter((k) => k !== kernel);

    // Drop the external-kernel reference here (in an action) once its kernel is
    // gone, rather than mutating observables inside the `kernel` computed.
    if (this._externalKernel === kernel) {
      this._externalKernel = null;
      this._externalKernelContext = null;
    }
  }

  getFilesForKernel(kernel) {
    const grammar = kernel.grammar.name;
    return this.filePaths.filter((file) => {
      const kernelOrMap = this.kernelMapping.get(file);
      if (!kernelOrMap) {
        return false;
      }
      return kernelOrMap instanceof Kernel
        ? kernelOrMap === kernel
        : kernelOrMap.get(grammar) === kernel;
    });
  }

  dispose() {
    this.subscriptions.dispose();
    this.markersMapping.forEach((markerStore) => markerStore.clear());
    this.markersMapping.clear();
    // Destroy kernels with error handling to prevent one failure from blocking others
    this.runningKernels.forEach((kernel) => {
      try {
        kernel.destroy();
      } catch (e) {
        console.error("[hydrogen-next] Error destroying kernel:", e);
      }
    });
    this.runningKernels = [];
    this.kernelMapping.clear();
  }

  updateEditor(editor) {
    this.editor = editor;
    this.setGrammar(editor);

    if (this.globalMode && this.kernel && editor) {
      const fileName = editor.getPath();
      if (!fileName) {
        return;
      }
      this.kernelMapping.set(fileName, this.kernel);
    }
  }

  // Returns the embedded grammar for multilanguage, normal grammar otherwise
  getEmbeddedGrammar(editor) {
    const grammar = editor.getGrammar();

    if (!isMultilanguageGrammar(grammar)) {
      return grammar;
    }

    const embeddedScope = getEmbeddedScope(editor, editor.getCursorBufferPosition());
    if (!embeddedScope) {
      return grammar;
    }
    const scope = embeddedScope.replace(".embedded", "");
    return atom.grammars.grammarForScopeName(scope);
  }

  setGrammar(editor) {
    if (!editor) {
      this.grammar = null;
      return;
    }

    this.grammar = this.getEmbeddedGrammar(editor);
  }

  setConfigValue(keyPath, newValue) {
    if (!newValue) {
      newValue = atom.config.get(keyPath);
    }

    this.configMapping.set(keyPath, newValue);
  }

  /**
   * Set an external kernel as the current kernel.
   * Used by jupyter-next to make its kernels visible to Variable Explorer, etc.
   * @param {Object|null} kernel - The kernel to set as current, or null to clear
   * @param {Object|null} context - Optional active pane/path context for this kernel
   */
  setExternalKernel(kernel, context = null) {
    this._externalKernel = kernel;
    this._externalKernelContext = context;
  }

  updateActivePaneItem(item) {
    this.activePaneItem = item || null;
  }

  _externalKernelContextMatches() {
    const context = this._externalKernelContext;
    if (!context) return true;

    const activeItem = this.activePaneItem;
    if (context.paneItem && activeItem === context.paneItem) {
      return true;
    }

    const activePath = activeItem?.getPath?.();
    if (context.filePath && activePath === context.filePath) {
      return true;
    }

    if (!this._activePaneItemIsEditor()) {
      return false;
    }

    const editorPath = this.editor?.getPath?.();
    return Boolean(context.filePath && editorPath === context.filePath);
  }

  _activePaneItemIsEditor() {
    const activeItem = this.activePaneItem;
    return Boolean(activeItem && activeItem === this.editor);
  }

  _activePaneItemIsTextEditor() {
    const activeItem = this.activePaneItem;
    return Boolean(activeItem && atom.workspace.isTextEditor(activeItem));
  }

  // Resolve the kernel mapped to the active center pane item by its path. Used
  // for non-editor center items (e.g. a Jupyter notebook) so the status bar
  // reflects that item's kernel instead of the sticky editor's.
  _kernelForActiveItemPath() {
    const path = this.activePaneItem?.getPath?.();
    if (!path) {
      return null;
    }
    const kernelOrMap = this.kernelMapping.get(path);
    if (!kernelOrMap) {
      return null;
    }
    if (kernelOrMap instanceof Kernel) {
      return kernelOrMap;
    }
    return typeof kernelOrMap.values === "function"
      ? kernelOrMap.values().next().value || null
      : null;
  }

  /** Force mobx to recalculate filePath (which depends on editor observable) */
  forceEditorUpdate() {
    const currentEditor = this.editor;
    if (!currentEditor) {
      return;
    }
    const oldKey = this.filePath;
    // Return back if the kernel for this editor is already disposed.
    if (!oldKey || !this.kernelMapping.has(oldKey)) {
      return;
    }
    this.updateEditor(null);
    this.updateEditor(currentEditor);
    const newKey = this.filePath;
    if (!newKey) {
      return;
    }
    // Change key of kernelMapping from editor ID to file path
    this.kernelMapping.set(newKey, this.kernelMapping.get(oldKey));
    this.kernelMapping.delete(oldKey);
  }
}
const store = new Store();
export default store; // For debugging

window.hydrogen_store = store;
