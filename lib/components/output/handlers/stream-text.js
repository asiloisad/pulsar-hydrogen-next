/** @babel */
/** @jsx React.createElement */

import React from "react";
import Anser from "anser";
import { truncateOutput } from "../../../shared/ansi-utils";

/**
 * StreamText handler - renders stream output type (stdout/stderr)
 *
 * Processes ANSI escape codes for colored terminal output.
 */
export function StreamText({ output, expanded }) {
  if (!output || output.output_type !== "stream") {
    return null;
  }

  const { text: rawText, name } = output;
  if (!rawText) {
    return null;
  }

  // Truncate to prevent crashes from large outputs
  const { text, truncated } = truncateOutput(rawText);

  // Escape HTML entities first, then convert ANSI codes to HTML
  // This prevents text like "<class 'str'>" from being interpreted as HTML tags
  const escaped = Anser.escapeForHtml(text);
  const html = Anser.ansiToHtml(escaped);

  const className = `stream-output stream-${name || "stdout"}`;

  return (
    <div>
      <pre className={className}>
        <span dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
      {truncated && <div className="output-truncated">... output truncated</div>}
    </div>
  );
}

StreamText.displayName = "StreamText";
