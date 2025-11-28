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
export {
  ANSI_COLORS,
  ANSI_BG_COLORS,
  ansiToHtml,
  ansiToHtmlManual,
  escapeCarriageReturn,
  escapeCarriageReturnSafe,
  stripAnsi,
} from "./ansi-utils";

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
export {
  default as Display,
  supportedMediaTypes,
  isTextOutputOnly,
} from "../components/result-view/display";
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

// Re-export @nteract/outputs components for convenience
export {
  Output,
  ExecuteResult,
  DisplayData,
  StreamText,
  KernelOutputError,
  RichMedia,
  Media,
} from "@nteract/outputs";

// Re-export the kernel manager class for jupyter-next
export { KernelManager } from "../kernel-manager";

// Re-export utility functions from utils.js
export {
  kernelSpecProvidesGrammar,
  grammarToLanguage,
  getEditorDirectory,
  msgSpecToNotebookFormat,
} from "../utils";

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
    "result-view": "../components/result-view/result-view",
  };

  const relativePath = componentMap[component];
  if (!relativePath) {
    throw new Error(`Unknown component: ${component}`);
  }

  return path.resolve(__dirname, relativePath);
}

/**
 * Version of the shared API.
 * Increment this when making breaking changes.
 */
export const SHARED_API_VERSION = "1.0.0";
