/** @babel */
/** @jsx React.createElement */

/**
 * Custom HTML component that safely handles Altair/Vega HTML output
 * by extracting specs and rendering with native Vega renderer,
 * avoiding CSP inline script issues.
 */
import React from "react";
import { VegaEmbed, MEDIA_TYPES } from "./vega";

/**
 * Extract a balanced JSON object or array from a string starting at a given position
 * @param {string} str - The string to extract from
 * @param {number} startIndex - The starting position
 * @param {string} startChar - The opening character ('{' or '['), defaults to '{'
 */
function extractBalancedJSON(str, startIndex, startChar = "{") {
  const endChar = startChar === "{" ? "}" : "]";
  if (str[startIndex] !== startChar) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < str.length; i++) {
    const char = str[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === "\\" && inString) {
      escape = true;
      continue;
    }

    if (char === '"' && !escape) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === startChar) depth++;
      else if (char === endChar) {
        depth--;
        if (depth === 0) {
          return str.substring(startIndex, i + 1);
        }
      }
    }
  }

  return null;
}

/**
 * Try to extract Vega/Vega-Lite spec from Altair HTML output
 */
function extractVegaSpec(html) {
  // Method 1: Altair IIFE pattern - spec is passed as first argument at the end
  // Pattern: })({"config": ..., "$schema": "...vega..."}, embedOpt);
  // Look for })({ which starts the spec argument
  const iifePattern = /\}\)\s*\(\s*\{/g;
  let match;
  while ((match = iifePattern.exec(html)) !== null) {
    const startIndex = match.index + match[0].length - 1; // Position of the opening {
    const specStr = extractBalancedJSON(html, startIndex);
    if (specStr) {
      try {
        const spec = JSON.parse(specStr);
        // Verify it looks like a Vega spec
        if (
          spec.$schema ||
          spec.mark ||
          spec.data ||
          spec.layer ||
          spec.vconcat ||
          spec.hconcat ||
          spec.config
        ) {
          return spec;
        }
      } catch (e) {
        // JSON parse failed, continue searching
      }
    }
  }

  // Method 2: Find vegaEmbed call and extract the spec object
  const vegaEmbedIndex = html.indexOf("vegaEmbed(");
  if (vegaEmbedIndex !== -1) {
    // Find the opening brace of the spec (second argument after the selector)
    const afterVegaEmbed = html.substring(vegaEmbedIndex);
    // Skip past the first argument (selector string)
    const commaIndex = afterVegaEmbed.indexOf(",");
    if (commaIndex !== -1) {
      const afterComma = afterVegaEmbed.substring(commaIndex + 1);
      const braceIndex = afterComma.indexOf("{");
      if (braceIndex !== -1) {
        const specStr = extractBalancedJSON(afterComma, braceIndex);
        if (specStr) {
          try {
            const spec = JSON.parse(specStr);
            if (
              spec.$schema ||
              spec.mark ||
              spec.data ||
              spec.layer ||
              spec.vconcat ||
              spec.hconcat
            ) {
              return spec;
            }
          } catch (e) {
            // JSON parse failed
          }
        }
      }
    }
  }

  // Method 3: Try to find spec in a script tag with type application/json
  const jsonScriptMatch = html.match(
    /<script[^>]*type\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (jsonScriptMatch) {
    try {
      return JSON.parse(jsonScriptMatch[1]);
    } catch (e) {
      // JSON parse failed
    }
  }

  // Method 4: Look for var spec = {...} or let spec = {...} or const spec = {...}
  const specVarMatch = html.match(/(?:var|let|const)\s+spec\s*=\s*/);
  if (specVarMatch) {
    const startIndex = html.indexOf(specVarMatch[0]) + specVarMatch[0].length;
    const braceIndex = html.indexOf("{", startIndex);
    if (braceIndex !== -1 && braceIndex - startIndex < 10) {
      // Allow some whitespace
      const specStr = extractBalancedJSON(html, braceIndex);
      if (specStr) {
        try {
          return JSON.parse(specStr);
        } catch (e) {
          // JSON parse failed
        }
      }
    }
  }

  // Method 5: Look for any large JSON object that looks like a Vega spec (by $schema)
  const schemaMatch = html.match(
    /\{\s*"[^"]*"\s*:\s*\{[^}]*\}[^}]*"\$schema"\s*:\s*"[^"]*vega[^"]*"/
  );
  if (schemaMatch) {
    // Find the start of this JSON object
    const schemaIndex = html.indexOf('"$schema"');
    if (schemaIndex !== -1) {
      // Search backwards for the opening brace
      let braceCount = 0;
      let startIndex = schemaIndex;
      for (let i = schemaIndex; i >= 0; i--) {
        if (html[i] === "}") braceCount++;
        else if (html[i] === "{") {
          if (braceCount === 0) {
            startIndex = i;
            break;
          }
          braceCount--;
        }
      }
      const specStr = extractBalancedJSON(html, startIndex);
      if (specStr) {
        try {
          return JSON.parse(specStr);
        } catch (e) {
          // JSON parse failed
        }
      }
    }
  }

  return null;
}

/**
 * Detect Vega/Vega-Lite version from spec
 */
function detectMediaType(spec) {
  if (!spec || !spec.$schema) {
    // Default to latest vega-lite if no schema
    if (spec && (spec.mark || spec.layer || spec.hconcat || spec.vconcat)) {
      return "application/vnd.vegalite.v5+json";
    }
    return null;
  }

  const schema = spec.$schema.toLowerCase();

  // Check for Vega-Lite
  if (schema.includes("vega-lite")) {
    // v6 maps to v5 renderer (backwards compatible)
    if (schema.includes("/v6")) return "application/vnd.vegalite.v5+json";
    if (schema.includes("/v5")) return "application/vnd.vegalite.v5+json";
    if (schema.includes("/v4")) return "application/vnd.vegalite.v4+json";
    if (schema.includes("/v3")) return "application/vnd.vegalite.v3+json";
    if (schema.includes("/v2")) return "application/vnd.vegalite.v2+json";
    if (schema.includes("/v1")) return "application/vnd.vegalite.v1+json";
    return "application/vnd.vegalite.v5+json"; // Default to v5
  }

  // Check for Vega
  if (schema.includes("vega")) {
    // v6 maps to v5 renderer (backwards compatible)
    if (schema.includes("/v6")) return "application/vnd.vega.v5+json";
    if (schema.includes("/v5")) return "application/vnd.vega.v5+json";
    if (schema.includes("/v4")) return "application/vnd.vega.v4+json";
    if (schema.includes("/v3")) return "application/vnd.vega.v3+json";
    if (schema.includes("/v2")) return "application/vnd.vega.v2+json";
    return "application/vnd.vega.v5+json"; // Default to v5
  }

  return null;
}

/**
 * Check if HTML contains Vega/Altair content
 */
function isVegaHTML(html) {
  return (
    html.includes("vegaEmbed") ||
    html.includes("vega-embed") ||
    html.includes("vega-lite") ||
    html.includes("application/vnd.vega")
  );
}

/**
 * Safe HTML component that handles Vega/Altair content specially
 * by extracting specs and rendering with native Vega renderer.
 * For Plotly, users should use the native notebook renderer (not sphinx_gallery).
 */
export class HTML extends React.PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      vegaSpec: null,
      vegaMediaType: null,
      isVega: false,
    };
    this.elRef = React.createRef();
  }

  componentDidMount() {
    this.processHTML(this.props.data);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.data !== this.props.data) {
      this.processHTML(this.props.data);
    }
  }

  processHTML(html) {
    if (!html) return;

    // Check if this is Vega/Altair HTML
    if (isVegaHTML(html)) {
      const spec = extractVegaSpec(html);
      if (spec) {
        const mediaType = detectMediaType(spec);
        if (mediaType) {
          this.setState({
            vegaSpec: spec,
            vegaMediaType: mediaType,
            isVega: true,
          });
          return;
        }
      }
    }

    // Not Vega content - render as safe HTML (without scripts)
    this.setState({
      isVega: false,
      vegaSpec: null,
      vegaMediaType: null,
    });
    this.renderSafeHTML(html);
  }

  renderSafeHTML(html) {
    if (!this.elRef.current) return;

    // Clear existing content
    while (this.elRef.current.firstChild) {
      this.elRef.current.removeChild(this.elRef.current.firstChild);
    }

    // Create a sanitized version without script tags
    const sanitized = html.replace(/<script[\s\S]*?<\/script>/gi, "");

    // Use innerHTML for safe content (no scripts)
    this.elRef.current.innerHTML = sanitized;
  }

  render() {
    const { isVega, vegaSpec, vegaMediaType } = this.state;

    if (isVega && vegaSpec && vegaMediaType) {
      return <VegaEmbed mediaType={vegaMediaType} spec={vegaSpec} />;
    }

    // Render container for non-Vega HTML (scripts stripped for CSP safety)
    return <div ref={this.elRef} className="html-output" />;
  }
}

HTML.defaultProps = {
  data: "",
  mediaType: "text/html",
};

HTML.MIMETYPE = "text/html";

export default HTML;
