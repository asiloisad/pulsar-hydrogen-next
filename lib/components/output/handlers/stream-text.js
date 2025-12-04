/** @babel */
/** @jsx React.createElement */

import React from "react";
import Anser from "anser";

/**
 * StreamText handler - renders stream output type (stdout/stderr)
 *
 * Processes ANSI escape codes for colored terminal output.
 */
export function StreamText({ output, expanded }) {
  if (!output || output.output_type !== "stream") {
    return null;
  }

  const { text, name } = output;
  if (!text) {
    return null;
  }

  // Convert ANSI codes to HTML with class-based colors
  const html = Anser.ansiToHtml(text);

  const className = `stream-output stream-${name || "stdout"}`;

  return (
    <pre className={className}>
      <span dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}

StreamText.displayName = "StreamText";
