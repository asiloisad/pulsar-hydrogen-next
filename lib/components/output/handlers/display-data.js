/** @babel */
/** @jsx React.createElement */

import React from "react";

/**
 * DisplayData handler - renders display_data output type
 *
 * The display_data output contains rich media data in the `data` field.
 * This component renders the supportedMediaTypes (RichMedia with children)
 * by cloning it and passing the data.
 */
export function DisplayData({ output, expanded, children }) {
  if (!output || output.output_type !== "display_data") {
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

DisplayData.displayName = "DisplayData";
