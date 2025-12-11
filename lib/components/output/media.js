/** @babel */
/** @jsx React.createElement */

import React from "react";
import { ansiToHtml, truncateOutput } from "../../shared/ansi-utils";

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Plain text renderer with ANSI color support
 */
function Plain({ data }) {
  if (data == null) return null;
  const rawText = typeof data === "string" ? data : String(data);

  // Truncate to prevent crashes from large outputs
  const { text, truncated } = truncateOutput(rawText);

  // Check if text contains ANSI escape codes
  const hasAnsi = /\x1b\[/.test(text);

  const truncatedNotice = truncated ? (
    <div className="output-truncated">... output truncated</div>
  ) : null;

  if (hasAnsi) {
    // Escape HTML first to prevent XSS, then convert ANSI codes
    // ANSI codes use \x1b (ESC char), not <, so escaping HTML won't affect them
    const escaped = escapeHtml(text);
    const html = ansiToHtml(escaped);
    return (
      <div>
        <pre className="output-text">
          <span dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
        {truncatedNotice}
      </div>
    );
  }

  // No ANSI codes - render as plain text (React will escape automatically)
  return (
    <div>
      <pre className="output-text">{text}</pre>
      {truncatedNotice}
    </div>
  );
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
      draggable={false}
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
  const rawFormatted =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const { text: formatted, truncated } = truncateOutput(rawFormatted);
  return (
    <div>
      <pre className="output-json">{formatted}</pre>
      {truncated && <div className="output-truncated">... output truncated</div>}
    </div>
  );
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
