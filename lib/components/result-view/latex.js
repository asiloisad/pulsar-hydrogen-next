/** @babel */
/** @jsx React.createElement */

/**
 * LaTeX component using MathJax 4 for rendering.
 * Uses @mathjax/src direct CJS imports for Electron compatibility.
 */
import React from "react";

// Lazy initialize MathJax to avoid module loading issues
let mjInitialized = false;
let adaptor = null;
let htmlDoc = null;

function initMathJax() {
  if (mjInitialized) return true;

  try {
    // Direct CJS imports - no dynamic loader (works in Electron)
    const { mathjax } = require("@mathjax/src/cjs/mathjax.js");
    const { TeX } = require("@mathjax/src/cjs/input/tex.js");
    const { SVG } = require("@mathjax/src/cjs/output/svg.js");
    const { liteAdaptor } = require("@mathjax/src/cjs/adaptors/liteAdaptor.js");
    const { RegisterHTMLHandler } = require("@mathjax/src/cjs/handlers/html.js");

    // Load TeX packages (v4 requires explicit registration)
    require("@mathjax/src/cjs/input/tex/base/BaseConfiguration.js");
    require("@mathjax/src/cjs/input/tex/ams/AmsConfiguration.js");
    require("@mathjax/src/cjs/input/tex/newcommand/NewcommandConfiguration.js");
    require("@mathjax/src/cjs/input/tex/action/ActionConfiguration.js");

    adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);

    const tex = new TeX({
      packages: ["base", "ams", "newcommand", "action"],
    });
    const svg = new SVG({
      fontCache: "local",
      linebreaks: { inline: false, width: "100000em" }, // Disable line-breaking
    });
    htmlDoc = mathjax.document("", { InputJax: tex, OutputJax: svg });

    mjInitialized = true;
    return true;
  } catch (err) {
    console.error("MathJax initialization error:", err);
    return false;
  }
}

// Strip math delimiters from LaTeX string
function stripDelimiters(latex) {
  let stripped = latex.trim();

  // Check for multiple equation environments - extract and combine them
  const envPattern =
    /\\begin\{(equation\*?|align\*?|gather\*?|multline\*?|eqnarray\*?)\}([\s\S]*?)\\end\{\1\}/g;
  const envMatches = [...stripped.matchAll(envPattern)];

  if (envMatches.length > 1) {
    // Multiple environments - combine contents into gathered
    const contents = envMatches.map((m) => m[2].trim());
    return { math: "\\begin{gathered}" + contents.join(" \\\\ ") + "\\end{gathered}", displayMode: true };
  }

  if (envMatches.length === 1) {
    // Single environment - just extract content
    return { math: envMatches[0][2].trim(), displayMode: true };
  }

  // Check for multiple $...$ or $$...$$ blocks
  const inlineMathPattern = /\$\$([^\$]+)\$\$|\$([^\$]+)\$/g;
  const mathMatches = [...stripped.matchAll(inlineMathPattern)];

  if (mathMatches.length > 1) {
    // Multiple inline/display math blocks - combine into gathered
    const contents = mathMatches.map((m) => (m[1] || m[2]).trim());
    return { math: "\\begin{gathered}" + contents.join(" \\\\ ") + "\\end{gathered}", displayMode: true };
  }

  // Remove display math delimiters
  if (stripped.startsWith("$$") && stripped.endsWith("$$")) {
    return { math: stripped.slice(2, -2), displayMode: true };
  }
  if (stripped.startsWith("\\[") && stripped.endsWith("\\]")) {
    return { math: stripped.slice(2, -2), displayMode: true };
  }

  // Remove inline math delimiters
  if (
    stripped.startsWith("$") &&
    stripped.endsWith("$") &&
    stripped.length > 2
  ) {
    return { math: stripped.slice(1, -1), displayMode: false };
  }
  if (stripped.startsWith("\\(") && stripped.endsWith("\\)")) {
    return { math: stripped.slice(2, -2), displayMode: false };
  }

  // No math delimiters found - treat as plain text
  return { math: null, isTextMode: true, original: stripped };
}

// Render LaTeX to SVG
function renderToSvg(latex, displayMode) {
  if (!htmlDoc || !adaptor) {
    throw new Error("MathJax not initialized");
  }
  const node = htmlDoc.convert(latex, { display: displayMode });
  return adaptor.innerHTML(node);
}

export class LaTeX extends React.Component {
  static defaultProps = {
    data: "",
    mediaType: "text/latex",
  };

  constructor(props) {
    super(props);
    this.state = {
      svg: null,
      error: null,
    };
  }

  componentDidMount() {
    this.renderLatex();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.data !== this.props.data) {
      this.renderLatex();
    }
  }

  renderLatex() {
    const latex = this.props.data || "";

    // Initialize MathJax if needed
    if (!initMathJax()) {
      this.setState({
        svg: null,
        error: "MathJax failed to initialize",
      });
      return;
    }

    try {
      const result = stripDelimiters(latex);

      if (result.isTextMode) {
        // Text-mode LaTeX - show as plain text (not math)
        this.setState({ svg: null, textContent: result.original, error: null });
        return;
      }

      const svg = renderToSvg(result.math, result.displayMode);
      this.setState({ svg, displayMode: result.displayMode, textContent: null, error: null });
    } catch (err) {
      console.error("MathJax rendering error:", err);
      this.setState({
        svg: null,
        error: err.message || "Unknown error",
      });
    }
  }

  render() {
    const latex = this.props.data || "";

    // MathJax error - show original LaTeX
    if (this.state.error) {
      return (
        <div className="latex-display latex-error">
          <code style={{ color: "#cc0000" }}>{latex}</code>
        </div>
      );
    }

    // Text-mode LaTeX (no math) - show as preformatted text
    if (this.state.textContent) {
      return (
        <div className="latex-display latex-text-mode">
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
            {this.state.textContent}
          </pre>
        </div>
      );
    }

    // Successfully rendered math
    if (this.state.svg) {
      const style = this.state.displayMode
        ? { textAlign: "center", margin: "0.5em 0" }
        : {};

      return (
        <div
          className="latex-display"
          style={style}
          dangerouslySetInnerHTML={{ __html: this.state.svg }}
        />
      );
    }

    // Loading state
    return (
      <div className="latex-display">
        <span style={{ color: "#888" }}>Rendering...</span>
      </div>
    );
  }
}

export default LaTeX;
