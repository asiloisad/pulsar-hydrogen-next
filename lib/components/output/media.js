/** @babel */
/** @jsx React.createElement */

import React from "react";

/**
 * Plain text renderer
 */
function Plain({ data }) {
  if (data == null) return null;
  const text = typeof data === "string" ? data : String(data);
  return <pre className="output-text">{text}</pre>;
}
Plain.defaultProps = { mediaType: "text/plain" };
Plain.MIMETYPE = "text/plain";
Plain.displayName = "Media.Plain";

/**
 * HTML renderer (basic - for complex HTML with Vega, use the custom HTML component)
 * Note: This is a simple renderer. The display.js uses a custom HTML component
 * that handles Vega extraction and CSP-safe rendering.
 */
function HTML({ data }) {
  if (!data) return null;
  // Strip script tags for basic safety
  const sanitized =
    typeof data === "string"
      ? data.replace(/<script[\s\S]*?<\/script>/gi, "")
      : "";
  return (
    <div
      className="html-output"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
HTML.defaultProps = { mediaType: "text/html" };
HTML.MIMETYPE = "text/html";
HTML.displayName = "Media.HTML";

/**
 * Image renderer - supports png, jpeg, gif
 * Data is expected to be base64 encoded
 */
function Image({ data, mediaType }) {
  if (!data) return null;
  const src = `data:${mediaType};base64,${data}`;
  return (
    <img
      className="output-image"
      src={src}
      alt="Output"
      style={{ maxWidth: "100%" }}
    />
  );
}
Image.defaultProps = { mediaType: "image/png" };
Image.MIMETYPE = "image/png";
Image.displayName = "Media.Image";

/**
 * SVG renderer
 */
function SVG({ data }) {
  if (!data) return null;
  return (
    <div
      className="output-svg"
      dangerouslySetInnerHTML={{ __html: data }}
    />
  );
}
SVG.defaultProps = { mediaType: "image/svg+xml" };
SVG.MIMETYPE = "image/svg+xml";
SVG.displayName = "Media.SVG";

/**
 * JSON renderer - pretty prints JSON data
 */
function Json({ data }) {
  if (data == null) return null;
  const formatted =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return <pre className="output-json">{formatted}</pre>;
}
Json.defaultProps = { mediaType: "application/json" };
Json.MIMETYPE = "application/json";
Json.displayName = "Media.Json";

/**
 * JavaScript renderer - displays JavaScript code
 */
function JavaScript({ data }) {
  if (!data) return null;
  return <pre className="output-javascript">{data}</pre>;
}
JavaScript.defaultProps = { mediaType: "application/javascript" };
JavaScript.MIMETYPE = "application/javascript";
JavaScript.displayName = "Media.JavaScript";

/**
 * Media namespace - contains all media type renderers
 */
export const Media = {
  Plain,
  HTML,
  Image,
  SVG,
  Json,
  JavaScript,
};
