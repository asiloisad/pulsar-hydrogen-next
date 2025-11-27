/** @babel */

/**
 * Output utilities for processing and normalizing Jupyter kernel output messages.
 * Shared between hydrogen-next and jupyter-next for consistent output handling.
 */

import { escapeCarriageReturnSafe } from "./ansi-utils";

// Valid output types from Jupyter messaging protocol
export const OUTPUT_TYPES = [
  "execute_result",
  "display_data",
  "stream",
  "error",
];

/**
 * Reduce/aggregate output messages, merging consecutive stream outputs.
 * This handles the case where output arrives incrementally over time.
 *
 * Based on: https://github.com/nteract/hydrogen/issues/466#issuecomment-274822937
 *
 * @param {Object[]} outputs - Existing kernel output messages
 * @param {Object} output - New output to be added
 * @returns {Object[]} - Updated outputs array
 */
export function reduceOutputs(outputs, output) {
  const last = outputs.length - 1;

  if (
    outputs.length > 0 &&
    output.output_type === "stream" &&
    outputs[last].output_type === "stream"
  ) {
    function appendText(previous, next) {
      previous.text = escapeCarriageReturnSafe(previous.text + next.text);
    }

    // Merge with last output if same stream name
    if (outputs[last].name === output.name) {
      appendText(outputs[last], output);
      return outputs;
    }

    // Or merge with second-to-last if interleaved stdout/stderr
    if (outputs.length > 1 && outputs[last - 1].name === output.name) {
      appendText(outputs[last - 1], output);
      return outputs;
    }
  }

  outputs.push(output);
  return outputs;
}

/**
 * Normalize output to ensure all text fields are strings, not arrays.
 * The Jupyter notebook format allows text to be arrays of strings,
 * but rendering libraries expect strings.
 *
 * @param {Object} output - Jupyter output message
 * @returns {Object} - Normalized output with string text fields
 */
export function normalizeOutput(output) {
  if (!output) return output;

  const normalized = { ...output };

  // Normalize stream text
  if (normalized.text !== undefined) {
    normalized.text = Array.isArray(normalized.text)
      ? normalized.text.join("")
      : typeof normalized.text === "string"
      ? normalized.text
      : String(normalized.text || "");
  }

  // Normalize data fields in execute_result and display_data
  if (normalized.data) {
    normalized.data = { ...normalized.data };
    for (const [mimeType, content] of Object.entries(normalized.data)) {
      if (Array.isArray(content)) {
        normalized.data[mimeType] = content.join("");
      } else if (
        content !== null &&
        typeof content !== "string" &&
        typeof content !== "object"
      ) {
        // Convert non-string primitives to string (except objects which might be JSON)
        normalized.data[mimeType] = String(content);
      }
    }
  }

  // Normalize traceback in error outputs
  if (normalized.traceback) {
    // Ensure each traceback line is a string
    normalized.traceback = normalized.traceback.map((line) =>
      Array.isArray(line)
        ? line.join("")
        : typeof line === "string"
        ? line
        : String(line || "")
    );
  }

  return normalized;
}

/**
 * Convert output to notebook JSON format (arrays of strings for multiline).
 *
 * @param {Object} output - Normalized output
 * @returns {Object} - Output in notebook format
 */
export function outputToNotebookFormat(output) {
  const result = { ...output };

  // Convert text to array format for notebook compatibility
  if (result.text && typeof result.text === "string") {
    result.text = result.text
      .split("\n")
      .map((line, i, arr) => (i < arr.length - 1 ? line + "\n" : line));
  }

  // Convert data text fields to array format
  if (result.data) {
    Object.keys(result.data).forEach((key) => {
      if (typeof result.data[key] === "string" && key.startsWith("text/")) {
        result.data[key] = result.data[key]
          .split("\n")
          .map((line, i, arr) => (i < arr.length - 1 ? line + "\n" : line));
      }
    });
  }

  return result;
}

/**
 * Convert Jupyter message spec to notebook format.
 * Creates an object that adheres to the Jupyter notebook specification.
 * http://jupyter-client.readthedocs.io/en/latest/messaging.html
 *
 * @param {Object} message - Message that has content which can be converted to nbformat
 * @returns {Object} - Message with the associated output type
 */
export function msgSpecToNotebookFormat(message) {
  return Object.assign({}, message.content, {
    output_type: message.header.msg_type,
  });
}

/**
 * Check if output contains only plain text (no rich content).
 *
 * @param {Object} data - Output data bundle
 * @param {Array} supportedMediaTypes - List of supported media types
 * @returns {boolean} - True if only text/plain is present
 */
export function isTextOutputOnly(data, supportedMediaTypes = null) {
  if (!data) return true;

  const mediaTypes = Object.keys(data);
  if (mediaTypes.length === 0) return true;
  if (mediaTypes.length === 1 && mediaTypes[0] === "text/plain") return true;

  // If we have supported types list, check if only text/plain is supported
  if (supportedMediaTypes) {
    const supported = mediaTypes.filter((mt) =>
      supportedMediaTypes.includes(mt)
    );
    return supported.length === 1 && supported[0] === "text/plain";
  }

  return false;
}

/**
 * Check if text is a single line that fits in available space.
 *
 * @param {string} text - Text to check
 * @param {number} availableSpace - Available characters
 * @returns {boolean} - True if text is single line and fits
 */
export function isSingleLine(text, availableSpace) {
  if (!text) return true;
  const processed = escapeCarriageReturnSafe(text);
  const hasNewline = text.includes("\n");
  const isTrailingNewlineOnly = text.indexOf("\n") === text.length - 1;

  return (
    (!hasNewline || isTrailingNewlineOnly) && availableSpace > processed.length
  );
}

/**
 * Get plain text representation of outputs.
 *
 * @param {Object[]} outputs - Array of output messages
 * @returns {string} - Plain text content
 */
export function getOutputPlainText(outputs) {
  if (!outputs || outputs.length === 0) return "";

  const texts = [];

  outputs.forEach((output) => {
    if (output.output_type === "stream") {
      texts.push(output.text || "");
    } else if (
      output.output_type === "execute_result" ||
      output.output_type === "display_data"
    ) {
      if (output.data && output.data["text/plain"]) {
        const text = output.data["text/plain"];
        texts.push(Array.isArray(text) ? text.join("") : text);
      }
    } else if (output.output_type === "error") {
      if (output.traceback) {
        texts.push(output.traceback.join("\n"));
      } else {
        texts.push(`${output.ename}: ${output.evalue}`);
      }
    }
  });

  return texts.join("\n");
}

/**
 * Sanitize HTML to remove potentially dangerous content.
 *
 * @param {string} html - HTML content
 * @returns {string} - Sanitized HTML
 */
export function sanitizeHtml(html) {
  if (!html || typeof html !== "string") return "";

  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\s*on\w+\s*=\s*[^\s>]+/gi, "");
}

/**
 * Priority order for MIME types when rendering output.
 */
export const MIME_TYPE_PRIORITY = [
  "application/vnd.jupyter.widget-view+json",
  "application/vnd.vegalite.v5+json",
  "application/vnd.vegalite.v4+json",
  "application/vnd.vegalite.v3+json",
  "application/vnd.vegalite.v2+json",
  "application/vnd.vegalite.v1+json",
  "application/vnd.vega.v5+json",
  "application/vnd.vega.v4+json",
  "application/vnd.vega.v3+json",
  "application/vnd.vega.v2+json",
  "application/vnd.plotly.v1+json",
  "text/html",
  "application/pdf",
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/json",
  "application/geo+json",
  "application/javascript",
  "text/latex",
  "text/markdown",
  "text/plain",
];

/**
 * Get the best MIME type from output data based on priority.
 *
 * @param {Object} data - Output data bundle
 * @returns {string|null} - Best available MIME type
 */
export function getBestMimeType(data) {
  if (!data) return null;

  for (const mimeType of MIME_TYPE_PRIORITY) {
    if (data[mimeType] !== undefined) {
      return mimeType;
    }
  }

  return null;
}
