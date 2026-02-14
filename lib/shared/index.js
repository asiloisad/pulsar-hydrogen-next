/** @babel */

/**
 * Shared module for hydrogen-next.
 *
 * This module provides shared utilities and components that can be reused
 * by dependent packages like jupyter-next.
 *
 * Usage from jupyter-next:
 *   const hydrogen = atom.packages.getLoadedPackage('hydrogen-next')
 *   const shared = require(path.join(hydrogen.path, 'lib', 'shared'))
 */

// Re-export ANSI utilities
export { AnsiText, escapeCarriageReturn, truncateOutput } from "./ansi-utils";

// Re-export output utilities
export {
  OUTPUT_TYPES,
  reduceOutputs,
  normalizeOutput,
  outputToNotebookFormat,
  msgSpecToNotebookFormat,
  isTextOutputOnly,
  isSingleLine,
  getOutputPlainText,
  sanitizeHtml,
  MIME_TYPE_PRIORITY,
  getBestMimeType,
} from "./output-utils";

// Re-export execution time utilities
export {
  NO_EXECTIME_STRING,
  formatExecutionTime,
  executionTime,
  getExecutionTimeMs,
  createExecutionTimeTracker,
} from "./execution-time";

// Re-export result-view components for output rendering
// These are the React components used to render Jupyter outputs
// Note: isTextOutputOnly is already exported from output-utils above
export { default as Display, supportedMediaTypes } from "../components/result-view/display";
export { default as LaTeX } from "../components/result-view/latex";
export { default as Markdown } from "../components/result-view/markdown";
export { default as HTML } from "../components/result-view/html";
export { default as Plotly } from "../components/result-view/plotly";
export {
  VegaLite1,
  VegaLite2,
  VegaLite3,
  VegaLite4,
  VegaLite5,
  Vega2,
  Vega3,
  Vega4,
  Vega5,
} from "../components/result-view/vega";
export { default as Status } from "../components/result-view/status";

// Re-export output components (custom implementation replacing @nteract/outputs)
export {
  Output,
  ExecuteResult,
  DisplayData,
  StreamText,
  KernelOutputError,
  RichMedia,
  Media,
} from "../components/output";

// Re-export the kernel manager class for jupyter-next
export { KernelManager } from "../kernel-manager";

// Re-export utility functions from utils.js
// Note: msgSpecToNotebookFormat is already exported from output-utils above
export {
  kernelSpecProvidesGrammar,
  grammarToLanguage,
  getEditorDirectory,
  tildify,
} from "../utils";

// Re-export string utilities from code-manager.js
export { escapeStringRegexp, normalizeString } from "../code-manager";

/**
 * Get the path to a shared component.
 * Useful for dynamic requires.
 *
 * @param {string} component - Component name (e.g., 'latex', 'display')
 * @returns {string} - Full path to the component
 */
export function getComponentPath(component) {
  const path = require("path");
  const componentMap = {
    latex: "../components/result-view/latex",
    display: "../components/result-view/display",
    markdown: "../components/result-view/markdown",
    html: "../components/result-view/html",
    plotly: "../components/result-view/plotly",
    vega: "../components/result-view/vega",
    status: "../components/result-view/status",
    "result-view": "../components/result-view/result-view",
  };

  const relativePath = componentMap[component];
  if (!relativePath) {
    throw new Error(`Unknown component: ${component}`);
  }

  return path.resolve(__dirname, relativePath);
}

// Lazy-loaded store reference
let _store = null;

/**
 * Get the hydrogen-next global store.
 * The store manages kernel instances and is observed by UI components
 * like Variable Explorer, Kernel Monitor, and Inspector.
 *
 * @returns {Object|null} - The store singleton or null if not available
 */
export function getStore() {
  if (!_store) {
    try {
      _store = require("../store").default;
    } catch (e) {
      console.error("[hydrogen-next] Failed to load store:", e.message);
      return null;
    }
  }
  return _store;
}

/**
 * Register a kernel with the hydrogen-next store.
 * This makes the kernel visible to hydrogen-next tools like:
 * - Variable Explorer
 * - Kernel Monitor
 * - Inspector
 *
 * @param {Object} kernel - The kernel instance (from KernelManager.startKernel callback)
 * @param {string} filePath - The file path associated with this kernel
 * @param {Object} editor - The editor object (can be a mock with getPath, getGrammar, onDidDestroy)
 * @param {Object} grammar - The grammar object with name and scopeName
 * @returns {boolean} - True if registration succeeded
 */
export function registerKernel(kernel, filePath, editor, grammar) {
  const store = getStore();
  if (!store) {
    console.error("[hydrogen-next] Cannot register kernel: store not available");
    return false;
  }

  try {
    store.newKernel(kernel, filePath, editor, grammar);
    return true;
  } catch (e) {
    console.error("[hydrogen-next] Failed to register kernel:", e.message);
    return false;
  }
}

/**
 * Unregister a kernel from the hydrogen-next store.
 * Call this when shutting down a kernel to clean up.
 *
 * @param {Object} kernel - The kernel instance to unregister
 * @returns {boolean} - True if unregistration succeeded
 */
export function unregisterKernel(kernel) {
  const store = getStore();
  if (!store) {
    return false;
  }

  try {
    store.deleteKernel(kernel);
    return true;
  } catch (e) {
    console.error("[hydrogen-next] Failed to unregister kernel:", e.message);
    return false;
  }
}

/**
 * Set the current kernel for hydrogen-next tools.
 * This makes the kernel visible to Variable Explorer, Inspector, etc.
 * Call this when a notebook gains focus or starts executing.
 *
 * @param {Object|null} kernel - The kernel to set as current, or null to clear
 * @returns {boolean} - True if operation succeeded
 */
export function setCurrentKernel(kernel) {
  const store = getStore();
  if (!store) {
    return false;
  }

  try {
    store.setExternalKernel(kernel);
    return true;
  } catch (e) {
    console.error("[hydrogen-next] Failed to set current kernel:", e.message);
    return false;
  }
}

/**
 * Version of the shared API.
 * Increment this when making breaking changes.
 */
export const SHARED_API_VERSION = "1.1.0";
