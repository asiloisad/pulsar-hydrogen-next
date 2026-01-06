/** @babel */
/** @jsx React.createElement */

import React from "react";
import Anser from "anser";
import { truncateOutput } from "../../../shared/ansi-utils";

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

  // Format evalue with ANSI color support (escape HTML first)
  const formattedEvalue = evalue
    ? Anser.ansiToHtml(Anser.escapeForHtml(evalue))
    : "";

  // Format traceback with ANSI color support and truncation (escape HTML first)
  const rawTraceback = Array.isArray(traceback) ? traceback.join("\n") : "";
  const { text: truncatedTraceback, truncated } = truncateOutput(rawTraceback);
  const formattedTraceback = Anser.ansiToHtml(Anser.escapeForHtml(truncatedTraceback));

  // Only show header if there's no traceback (traceback already contains the error at the end)
  const showHeader = !formattedTraceback;

  return (
    <div className="kernel-error">
      {showHeader && (
        <div className="error-header">
          <span className="error-name">{ename}</span>
          {formattedEvalue && (
            <span
              className="error-value"
              dangerouslySetInnerHTML={{ __html: ": " + formattedEvalue }}
            />
          )}
        </div>
      )}
      {formattedTraceback && (
        <pre
          className="error-traceback"
          dangerouslySetInnerHTML={{ __html: formattedTraceback }}
        />
      )}
      {truncated && <div className="output-truncated">... traceback truncated</div>}
    </div>
  );
}

KernelOutputError.displayName = "KernelOutputError";
