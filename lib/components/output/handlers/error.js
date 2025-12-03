/** @babel */
/** @jsx React.createElement */

import React from "react";
import Anser from "anser";

/**
 * KernelOutputError handler - renders error output type
 *
 * Displays error name, value, and formatted traceback with ANSI color support.
 */
export function KernelOutputError({ output, expanded }) {
  if (!output || output.output_type !== "error") {
    return null;
  }

  const { ename, evalue, traceback } = output;

  // Format traceback with ANSI color support
  const formattedTraceback = Array.isArray(traceback)
    ? traceback
        .map((line) => Anser.ansiToHtml(line, { use_classes: true }))
        .join("\n")
    : "";

  return (
    <div className="kernel-error">
      <div className="error-header">
        <span className="error-name">{ename}</span>
        {evalue && <span className="error-value">: {evalue}</span>}
      </div>
      {formattedTraceback && (
        <pre
          className="error-traceback"
          dangerouslySetInnerHTML={{ __html: formattedTraceback }}
        />
      )}
    </div>
  );
}

KernelOutputError.displayName = "KernelOutputError";
