/** @babel */
/** @jsx React.createElement */

/**
 * LaTeX component using MathJax 3 for rendering.
 * Uses mathjax-full for Node.js/Electron compatibility.
 */
import React from "react";

// Lazy initialize MathJax to avoid module loading issues
let mjInitialized = false;
let adaptor = null;
let htmlDoc = null;

function initMathJax() {
  if (mjInitialized) return true;

  try {
    const { mathjax } = require("mathjax-full/js/mathjax.js");
    const { TeX } = require("mathjax-full/js/input/tex.js");
    const { SVG } = require("mathjax-full/js/output/svg.js");
    const { liteAdaptor } = require("mathjax-full/js/adaptors/liteAdaptor.js");
    const { RegisterHTMLHandler } = require("mathjax-full/js/handlers/html.js");
    const { AllPackages } = require("mathjax-full/js/input/tex/AllPackages.js");

    adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);

    const tex = new TeX({ packages: AllPackages });
    const svg = new SVG({ fontCache: "local" });
    htmlDoc = mathjax.document("", { InputJax: tex, OutputJax: svg });

    mjInitialized = true;
    return true;
  } catch (err) {
    console.error("MathJax initialization error:", err);
    return false;
  }
}

// Convert LaTeX length units to CSS
function latexLengthToCSS(value, unit) {
  const num = parseFloat(value);
  if (isNaN(num)) return "0.5em"; // Fallback to reasonable default

  // Convert LaTeX units to approximate CSS equivalents
  switch (unit) {
    case "pt":
      return `${num * 1.333}px`; // 1pt ≈ 1.333px
    case "em":
      return `${num}em`;
    case "ex":
      return `${num}ex`;
    case "cm":
      return `${num}cm`;
    case "mm":
      return `${num}mm`;
    case "in":
      return `${num}in`;
    default:
      return `${num}px`;
  }
}

// Extract vertical spacing from LaTeX text
// Returns array of { type: 'spacer', height: string } or { type: 'text', content: string }
function extractSpacingFromText(text) {
  const result = [];

  // Pattern for various spacing commands
  const spacingPatterns = [
    // \\[5pt] - line break with optional spacing
    {
      pattern: /\\\\(?:\[(\d+(?:\.\d+)?)(pt|em|ex|cm|mm|in)?\])?/g,
      getHeight: (m) => (m[1] ? latexLengthToCSS(m[1], m[2] || "pt") : "1em"),
    },
    // \vspace{10pt}
    {
      pattern: /\\vspace\*?\s*\{(\d+(?:\.\d+)?)(pt|em|ex|cm|mm|in)?\}/g,
      getHeight: (m) => latexLengthToCSS(m[1], m[2] || "pt"),
    },
    // \addvspace{\medskipamount} etc
    {
      pattern: /\\addvspace\s*\{\\(medskipamount|bigskipamount|smallskipamount)\}/g,
      getHeight: (m) => {
        switch (m[1]) {
          case "smallskipamount":
            return "0.25em";
          case "medskipamount":
            return "0.5em";
          case "bigskipamount":
            return "1em";
          default:
            return "0.5em";
        }
      },
    },
    // \addvspace{10pt}
    {
      pattern: /\\addvspace\s*\{(\d+(?:\.\d+)?)(pt|em|ex|cm|mm|in)?\}/g,
      getHeight: (m) => latexLengthToCSS(m[1], m[2] || "pt"),
    },
    // \smallskip, \medskip, \bigskip
    {
      pattern: /\\(smallskip|medskip|bigskip)\b/g,
      getHeight: (m) => {
        switch (m[1]) {
          case "smallskip":
            return "0.25em";
          case "medskip":
            return "0.5em";
          case "bigskip":
            return "1em";
          default:
            return "0.5em";
        }
      },
    },
    // \par - paragraph break
    { pattern: /\\par\b/g, getHeight: () => "0.5em" },
  ];

  // Find all spacing commands with their positions
  const spacings = [];
  for (const { pattern, getHeight } of spacingPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      spacings.push({
        start: match.index,
        end: match.index + match[0].length,
        height: getHeight(match),
      });
    }
  }

  // Sort by position
  spacings.sort((a, b) => a.start - b.start);

  // Remove overlapping (keep first)
  const filtered = [];
  let lastEnd = 0;
  for (const s of spacings) {
    if (s.start >= lastEnd) {
      filtered.push(s);
      lastEnd = s.end;
    }
  }

  // Build result
  let pos = 0;
  for (const s of filtered) {
    if (s.start > pos) {
      const textPart = text.slice(pos, s.start);
      const cleaned = cleanLatexForPlainText(textPart);
      if (cleaned) {
        result.push({ type: "text", content: cleaned });
      }
    }
    result.push({ type: "spacer", height: s.height });
    pos = s.end;
  }

  // Remaining text
  if (pos < text.length) {
    const textPart = text.slice(pos);
    const cleaned = cleanLatexForPlainText(textPart);
    if (cleaned) {
      result.push({ type: "text", content: cleaned });
    }
  }

  return result;
}

// Extract math environments from LaTeX content
// Returns array of { type: 'text'|'math'|'spacer', content: string, displayMode: boolean, height: string }
function extractMathBlocks(latex) {
  const blocks = [];

  // First, find all equation-like environments (they can span multiple lines)
  const envNames = [
    "equation\\*?",
    "align\\*?",
    "gather\\*?",
    "multline\\*?",
    "eqnarray\\*?",
  ];
  const envPattern = new RegExp(
    "\\\\begin\\{(" + envNames.join("|") + ")\\}([\\s\\S]*?)\\\\end\\{\\1\\}",
    "g"
  );

  // Find all math blocks with their positions
  const mathBlocks = [];

  // Find environment-based math
  let match;
  while ((match = envPattern.exec(latex)) !== null) {
    mathBlocks.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[0],
      displayMode: true,
    });
  }

  // Find $$...$$ display math
  const displayDollarPattern = /\$\$([\s\S]*?)\$\$/g;
  while ((match = displayDollarPattern.exec(latex)) !== null) {
    mathBlocks.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[0],
      displayMode: true,
    });
  }

  // Find \[...\] display math (but not \\[5pt] line break arguments)
  // Display math \[...\] must contain something other than just a dimension
  const displayBracketPattern = /\\\[([\s\S]*?)\\\]/g;
  while ((match = displayBracketPattern.exec(latex)) !== null) {
    const content = match[1];
    // Skip if it's just a line break argument like [5pt], [10em], etc.
    if (/^\s*\d+(?:\.\d+)?(?:pt|em|ex|cm|mm|in)?\s*$/.test(content)) {
      continue;
    }
    mathBlocks.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[0],
      displayMode: true,
    });
  }

  // Find $...$ inline math (but not $$)
  // Allow newlines inside - multiline math like matrices is common
  const inlineDollarPattern = /\$([^\$]+)\$/g;
  while ((match = inlineDollarPattern.exec(latex)) !== null) {
    // Make sure this isn't part of $$
    if (
      latex[match.index - 1] !== "$" &&
      latex[match.index + match[0].length] !== "$"
    ) {
      mathBlocks.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[0],
        displayMode: false,
      });
    }
  }

  // Find \(...\) inline math
  const inlineParenPattern = /\\\(([\s\S]*?)\\\)/g;
  while ((match = inlineParenPattern.exec(latex)) !== null) {
    mathBlocks.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[0],
      displayMode: false,
    });
  }

  // Sort by position
  mathBlocks.sort((a, b) => a.start - b.start);

  // Remove overlapping blocks (keep the first one)
  const filteredBlocks = [];
  let lastEnd = 0;
  for (const block of mathBlocks) {
    if (block.start >= lastEnd) {
      filteredBlocks.push(block);
      lastEnd = block.end;
    }
  }

  // Build result with text and math blocks interleaved
  let pos = 0;
  for (const block of filteredBlocks) {
    // Add text/spacers before this math block
    if (block.start > pos) {
      const textContent = latex.slice(pos, block.start);
      const spacingBlocks = extractSpacingFromText(textContent);
      blocks.push(...spacingBlocks);
    }
    // Add math block
    blocks.push({
      type: "math",
      content: block.content,
      displayMode: block.displayMode,
    });
    pos = block.end;
  }

  // Add remaining text/spacers
  if (pos < latex.length) {
    const textContent = latex.slice(pos);
    const spacingBlocks = extractSpacingFromText(textContent);
    blocks.push(...spacingBlocks);
  }

  // Clean up spacers: remove leading, trailing, and collapse consecutive
  return cleanupSpacers(blocks);
}

// Remove leading/trailing spacers and collapse consecutive spacers
function cleanupSpacers(blocks) {
  if (blocks.length === 0) return blocks;

  // Remove leading spacers
  while (blocks.length > 0 && blocks[0].type === "spacer") {
    blocks.shift();
  }

  // Remove trailing spacers
  while (blocks.length > 0 && blocks[blocks.length - 1].type === "spacer") {
    blocks.pop();
  }

  // Collapse consecutive spacers (keep the larger height)
  const result = [];
  for (const block of blocks) {
    if (block.type === "spacer" && result.length > 0) {
      const prev = result[result.length - 1];
      if (prev.type === "spacer") {
        // Keep the larger spacer height
        const prevHeight = parseFloat(prev.height) || 0;
        const currHeight = parseFloat(block.height) || 0;
        if (currHeight > prevHeight) {
          prev.height = block.height;
        }
        continue;
      }
    }
    result.push(block);
  }

  return result;
}

// Clean up LaTeX text for display as plain text
// Note: Spacing commands (\\, \par, \vspace, \addvspace) are handled separately by extractSpacingFromText
function cleanLatexForPlainText(latex) {
  return latex
    .replace(/\\hspace\s*\{[^}]*\}/g, " ")
    .replace(/\\hfill\b/g, " ")
    .replace(/\\noindent\b/g, "")
    .replace(/\\begin\{minipage\}(?:\[[^\]]*\])?\{[^}]*\}/g, "")
    .replace(/\\end\{minipage\}/g, "")
    .replace(/\\begin\{itemize\}/g, "")
    .replace(/\\end\{itemize\}/g, "")
    .replace(/\\item\b/g, "• ")
    .replace(/\\textbf\s*\{([^}]*)\}/g, "$1")
    .replace(/\\textit\s*\{([^}]*)\}/g, "$1")
    .replace(/\\emph\s*\{([^}]*)\}/g, "$1")
    .replace(/\\text\s*\{([^}]*)\}/g, "$1")
    .replace(/~/g, "\u00A0\u00A0") // ~ is non-breaking space in LaTeX (doubled for visibility)
    .replace(/%.*$/gm, "") // Remove LaTeX comments
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

// Strip math delimiters from LaTeX string
function stripDelimiters(latex) {
  let stripped = latex.trim();

  // Remove equation environment but keep content
  const envMatch = stripped.match(
    /\\begin\{(equation\*?|align\*?|gather\*?|multline\*?|eqnarray\*?)\}([\s\S]*)\\end\{\1\}/
  );
  if (envMatch) {
    return { math: envMatch[2].trim(), displayMode: true };
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

  // No delimiters - treat as display math
  return { math: stripped, displayMode: true };
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
      renderedBlocks: null,
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
        renderedBlocks: null,
        error: "MathJax failed to initialize",
      });
      return;
    }

    try {
      // Extract math blocks from the content
      const blocks = extractMathBlocks(latex);

      // If no math blocks found, show as plain text
      if (
        blocks.length === 0 ||
        blocks.every((b) => b.type === "text" || b.type === "spacer")
      ) {
        this.setState({
          renderedBlocks: [
            { type: "text", content: cleanLatexForPlainText(latex) },
          ],
          error: null,
        });
        return;
      }

      // Render each block
      const renderedBlocks = blocks.map((block) => {
        if (block.type === "text") {
          return { type: "text", content: block.content };
        } else if (block.type === "spacer") {
          return { type: "spacer", height: block.height };
        } else {
          const { math, displayMode } = stripDelimiters(block.content);
          const svg = renderToSvg(math, displayMode);
          return { type: "math", svg, displayMode };
        }
      });

      this.setState({ renderedBlocks, error: null });
    } catch (err) {
      console.error("MathJax rendering error:", err);
      this.setState({
        renderedBlocks: null,
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

    // Successfully rendered
    if (this.state.renderedBlocks) {
      const blocks = this.state.renderedBlocks;

      // Check if all math blocks are inline (no display mode)
      const hasDisplayMath = blocks.some(
        (b) => b.type === "math" && b.displayMode
      );
      // Check if any text has newlines
      const hasMultilineText = blocks.some(
        (b) => b.type === "text" && b.content && b.content.includes("\n")
      );
      // Use inline layout if all math is inline and no multiline text
      const useInlineLayout = !hasDisplayMath && !hasMultilineText;

      return (
        <div className="latex-display">
          {blocks.map((block, i) => {
            if (block.type === "text") {
              if (!block.content) return null;
              // Use span for inline layout, div for block layout
              if (useInlineLayout) {
                return (
                  <span key={i} className="latex-text">
                    {block.content}
                  </span>
                );
              }
              return (
                <div
                  key={i}
                  className="latex-text"
                  style={{
                    whiteSpace: "pre-wrap",
                    marginBottom: "0.5em",
                  }}
                >
                  {block.content}
                </div>
              );
            } else if (block.type === "spacer") {
              return (
                <div
                  key={i}
                  className="latex-spacer"
                  style={{ height: block.height }}
                />
              );
            } else {
              // Math block - use span for inline, div for display
              if (!block.displayMode) {
                return (
                  <span
                    key={i}
                    className="latex-math-inline"
                    dangerouslySetInnerHTML={{ __html: block.svg }}
                  />
                );
              }
              return (
                <div
                  key={i}
                  className="latex-math-display"
                  style={{ textAlign: "center", margin: "0.5em 0" }}
                  dangerouslySetInnerHTML={{ __html: block.svg }}
                />
              );
            }
          })}
        </div>
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
