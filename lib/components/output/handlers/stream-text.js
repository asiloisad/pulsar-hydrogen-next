/** @babel */
/** @jsx React.createElement */

import React from "react";
import { truncateOutput, AnsiText } from "../../../shared/ansi-utils";

/**
 * StreamText handler - renders stream output type (stdout/stderr)
 *
 * Processes ANSI escape codes for colored terminal output.
 */
export function StreamText({ output }) {
  if (!output || output.output_type !== "stream") {
    return null;
  }

  const { text: rawText, name } = output;
  if (!rawText) {
    return null;
  }

  // Truncate to prevent crashes from large outputs
  const { text, truncated } = truncateOutput(rawText);

  const className = `stream-output stream-${name || "stdout"}`;

  return (
    <div>
      <pre className={className}>
        <AnsiText text={text} />
      </pre>
      {truncated && <div className="output-truncated">... output truncated</div>}
    </div>
  );
}

StreamText.displayName = "StreamText";
