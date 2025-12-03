/** @babel */
/** @jsx React.createElement */

import React from "react";

/**
 * MIME type priority order for output rendering.
 * Higher priority types are tried first.
 */
const MIME_PRIORITY = [
  // Vega/Vega-Lite (interactive visualizations)
  "application/vnd.vega.v5+json",
  "application/vnd.vega.v4+json",
  "application/vnd.vega.v3+json",
  "application/vnd.vega.v2+json",
  "application/vnd.vegalite.v5+json",
  "application/vnd.vegalite.v4+json",
  "application/vnd.vegalite.v3+json",
  "application/vnd.vegalite.v2+json",
  "application/vnd.vegalite.v1+json",
  // Plotly
  "application/vnd.plotly.v1+json",
  // Rich formats
  "text/html",
  "text/markdown",
  "text/latex",
  "image/svg+xml",
  // Images
  "image/png",
  "image/jpeg",
  "image/gif",
  // Structured data
  "application/json",
  "application/javascript",
  // Plain text (fallback)
  "text/plain",
];

/**
 * RichMedia component - selects the best media type renderer for given data.
 *
 * Usage:
 * <RichMedia data={bundle}>
 *   <HTML />
 *   <Markdown />
 *   <Media.Plain />
 * </RichMedia>
 *
 * Each child should have a `mediaType` prop indicating what MIME type it handles.
 * RichMedia will select the highest-priority matching type and render that child.
 */
export function RichMedia({ data, children }) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const childArray = React.Children.toArray(children);

  // Build a map of mediaType -> child component
  const handlers = new Map();
  for (const child of childArray) {
    if (React.isValidElement(child)) {
      const mediaType =
        child.props.mediaType ||
        child.type.defaultProps?.mediaType ||
        child.type.MIMETYPE;
      if (mediaType) {
        handlers.set(mediaType, child);
      }
    }
  }

  // Find the highest priority MIME type that exists in data and has a handler
  for (const mimeType of MIME_PRIORITY) {
    if (data[mimeType] !== undefined && handlers.has(mimeType)) {
      const handler = handlers.get(mimeType);
      return React.cloneElement(handler, { data: data[mimeType] });
    }
  }

  // Fallback: check for any MIME type in data that has a handler
  for (const mimeType of Object.keys(data)) {
    if (handlers.has(mimeType)) {
      const handler = handlers.get(mimeType);
      return React.cloneElement(handler, { data: data[mimeType] });
    }
  }

  return null;
}

RichMedia.displayName = "RichMedia";
