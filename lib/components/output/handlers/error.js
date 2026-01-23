/** @babel */
/** @jsx React.createElement */

import React from "react";
import { truncateOutput, AnsiText } from "../../../shared/ansi-utils";

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

  // Format traceback with ANSI color support and truncation
  const rawTraceback = Array.isArray(traceback) ? traceback.join("\n") : "";
  const { text: truncatedTraceback, truncated } = truncateOutput(rawTraceback);

  // Only show header if there's no traceback (traceback already contains the error at the end)
  const showHeader = !truncatedTraceback;

  return (
    <div className="kernel-error">
      {showHeader && (
        <div className="error-header">
          <span className="error-name">{ename}</span>
          {evalue && (
            <span className="error-value">
              : <AnsiText text={evalue} />
            </span>
          )}
        </div>
      )}
      {truncatedTraceback && (
        <pre className="error-traceback">
          <AnsiText text={truncatedTraceback} />
        </pre>
      )}
      {truncated && <div className="output-truncated">... traceback truncated</div>}
    </div>
  );
}

KernelOutputError.displayName = "KernelOutputError";
