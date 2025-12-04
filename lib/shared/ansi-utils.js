/** @babel */

/**
 * ANSI color codes and utilities for converting ANSI escape sequences to HTML.
 * Shared between hydrogen-next and jupyter-next for consistent output rendering.
 */

import Anser from "anser";

// ANSI color code mappings for foreground colors
export const ANSI_COLORS = {
  "30": "ansi-black",
  "31": "ansi-red",
  "32": "ansi-green",
  "33": "ansi-yellow",
  "34": "ansi-blue",
  "35": "ansi-magenta",
  "36": "ansi-cyan",
  "37": "ansi-white",
  "90": "ansi-bright-black",
  "91": "ansi-bright-red",
  "92": "ansi-bright-green",
  "93": "ansi-bright-yellow",
  "94": "ansi-bright-blue",
  "95": "ansi-bright-magenta",
  "96": "ansi-bright-cyan",
  "97": "ansi-bright-white",
};

// ANSI color code mappings for background colors
export const ANSI_BG_COLORS = {
  "40": "ansi-bg-black",
  "41": "ansi-bg-red",
  "42": "ansi-bg-green",
  "43": "ansi-bg-yellow",
  "44": "ansi-bg-blue",
  "45": "ansi-bg-magenta",
  "46": "ansi-bg-cyan",
  "47": "ansi-bg-white",
};

/**
 * Convert ANSI escape sequences to HTML with proper class names.
 * Uses Anser library for robust parsing.
 *
 * @param {string} text - Text containing ANSI escape sequences
 * @returns {string} - HTML string with span elements for colored text
 */
export function ansiToHtml(text) {
  if (!text || typeof text !== "string") {
    return "";
  }

  // Use Anser for robust ANSI parsing
  return Anser.ansiToHtml(text, {
    remove_empty: true,
  });
}

/**
 * Convert ANSI escape sequences to HTML using manual parsing.
 * This is a fallback implementation that doesn't require external dependencies.
 *
 * @param {string} text - Text containing ANSI escape sequences
 * @returns {string} - HTML string with span elements for colored text
 */
export function ansiToHtmlManual(text) {
  if (!text || typeof text !== "string") {
    return "";
  }

  // Escape HTML first
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Parse ANSI escape sequences
  const parts = [];
  let currentClasses = [];
  let lastIndex = 0;

  // Match ANSI escape sequences
  const ansiRegex = /\x1b\[([0-9;]*)m/g;
  let match;

  while ((match = ansiRegex.exec(html)) !== null) {
    // Add text before this escape sequence
    if (match.index > lastIndex) {
      const textPart = html.substring(lastIndex, match.index);
      if (currentClasses.length > 0) {
        parts.push(
          `<span class="${currentClasses.join(" ")}">${textPart}</span>`
        );
      } else {
        parts.push(textPart);
      }
    }

    // Parse the escape code
    const codes = match[1].split(";").filter((c) => c !== "");

    for (const code of codes) {
      if (code === "0" || code === "") {
        // Reset
        currentClasses = [];
      } else if (code === "1") {
        currentClasses.push("ansi-bold");
      } else if (code === "3") {
        currentClasses.push("ansi-italic");
      } else if (code === "4") {
        currentClasses.push("ansi-underline");
      } else if (ANSI_COLORS[code]) {
        // Remove existing foreground color
        currentClasses = currentClasses.filter(
          (c) =>
            !c.startsWith("ansi-") ||
            c.startsWith("ansi-bg-") ||
            c === "ansi-bold" ||
            c === "ansi-italic" ||
            c === "ansi-underline"
        );
        currentClasses.push(ANSI_COLORS[code]);
      } else if (ANSI_BG_COLORS[code]) {
        // Remove existing background color
        currentClasses = currentClasses.filter(
          (c) => !c.startsWith("ansi-bg-")
        );
        currentClasses.push(ANSI_BG_COLORS[code]);
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < html.length) {
    const textPart = html.substring(lastIndex);
    if (currentClasses.length > 0) {
      parts.push(
        `<span class="${currentClasses.join(" ")}">${textPart}</span>`
      );
    } else {
      parts.push(textPart);
    }
  }

  return parts.join("");
}

/**
 * Escape carriage return characters by simulating terminal behavior.
 * When \r is encountered, it overwrites the current line from the beginning.
 *
 * @param {string} text - Text with possible carriage returns
 * @returns {string} - Processed text with carriage returns applied
 */
export function escapeCarriageReturn(text) {
  if (!text || typeof text !== "string") {
    return text;
  }

  const lines = text.split("\n");
  const result = [];

  for (let line of lines) {
    if (line.includes("\r")) {
      // Split by \r and process each segment
      const segments = line.split("\r");
      let currentLine = "";

      for (const segment of segments) {
        if (segment === "") {
          // Empty segment means \r at start or consecutive \r
          currentLine = "";
        } else {
          // Overwrite from the beginning with the new segment
          currentLine = segment + currentLine.slice(segment.length);
        }
      }
      result.push(currentLine);
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

/**
 * Escape carriage return with additional safety checks.
 *
 * @param {string} text - Text with possible carriage returns
 * @returns {string} - Processed text
 */
export function escapeCarriageReturnSafe(text) {
  if (!text || typeof text !== "string") {
    return text;
  }
  return escapeCarriageReturn(text);
}

/**
 * Strip ANSI escape codes from text.
 *
 * @param {string} text - Text with ANSI escape codes
 * @returns {string} - Clean text without ANSI codes
 */
export function stripAnsi(text) {
  if (!text || typeof text !== "string") {
    return text;
  }
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
