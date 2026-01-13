/** @babel */
/** @jsx React.createElement */

import React from "react";

/**
 * ExecuteResult handler - renders execute_result output type
 *
 * The execute_result output contains rich media data in the `data` field.
 * This component renders the supportedMediaTypes (RichMedia with children)
 * by cloning it and passing the data.
 */
export function ExecuteResult({ output, expanded, children }) {
  if (!output || output.output_type !== "execute_result") {
    return null;
  }

  const data = output.data;
  if (!data) {
    return null;
  }

  const metadata = output.metadata;

  // Children should be a RichMedia element with media type handlers
  if (React.isValidElement(children)) {
    return React.cloneElement(children, { data, metadata });
  }

  return null;
}

ExecuteResult.displayName = "ExecuteResult";
