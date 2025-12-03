/** @babel */

import { Point, Range } from "atom";
import compact from "lodash/compact";
import store from "./store";

/**
 * Escape special regex characters in a string
 * Replacement for escape-string-regexp package
 */
function escapeStringRegexp(string) {
  if (typeof string !== "string") {
    throw new TypeError("Expected a string");
  }
  // Escape characters with special meaning in RegExp
  return string.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&").replace(/-/g, "\\x2d");
}

/**
 * Strip leading indentation from each line in a string
 * Replacement for strip-indent package
 */
function stripIndent(string) {
  const match = string.match(/^[ \t]*(?=\S)/gm);
  if (!match) {
    return string;
  }
  const indent = Math.min(...match.map((x) => x.length));
  if (indent === 0) {
    return string;
  }
  const regex = new RegExp(`^[ \\t]{${indent}}`, "gm");
  return string.replace(regex, "");
}
import {
  log,
  isMultilanguageGrammar,
  getEmbeddedScope,
  rowRangeForCodeFoldAtBufferRow,
  js_idx_to_char_idx,
} from "./utils";

export function normalizeString(code) {
  if (code) {
    return code.replace(/\r\n|\r/g, "\n");
  }

  return null;
}

export function getRow(editor, row) {
  return normalizeString(editor.lineTextForBufferRow(row));
}

export function getTextInRange(editor, start, end) {
  const code = editor.getTextInBufferRange([start, end]);
  return normalizeString(code);
}

export function getRows(editor, startRow, endRow) {
  const code = editor.getTextInBufferRange({
    start: { row: startRow, column: 0 },
    end: { row: endRow, column: 9999999 },
  });
  return normalizeString(code);
}

export function getMetadataForRow(editor, anyPointInCell) {
  if (isMultilanguageGrammar(editor.getGrammar())) {
    return "codecell";
  }

  let cellType = "codecell";
  const buffer = editor.getBuffer();
  anyPointInCell = new Point(
    anyPointInCell.row,
    buffer.lineLengthForRow(anyPointInCell.row)
  );
  const regexString = getRegexString(editor);

  if (regexString) {
    const regex = new RegExp(regexString);
    buffer.backwardsScanInRange(
      regex,
      new Range(new Point(0, 0), anyPointInCell),
      ({ match }) => {
        for (let i = 1; i < match.length; i++) {
          if (match[i]) {
            switch (match[i]) {
              case "md":
              case "markdown":
                cellType = "markdown";
                break;

              case "codecell":
              default:
                cellType = "codecell";
                break;
            }
          }
        }
      }
    );
  }

  return cellType;
}

export function removeCommentsMarkdownCell(editor, text) {
  const commentStartString = getCommentStartString(editor);
  if (!commentStartString) {
    return text;
  }
  const lines = text.split("\n");
  const editedLines = [];

  lines.forEach((line) => {
    if (line.startsWith(commentStartString)) {
      // Remove comment from start of line
      editedLines.push(line.slice(commentStartString.length));
    } else {
      editedLines.push(line);
    }
  });

  return stripIndent(editedLines.join("\n"));
}

export function getSelectedText(editor) {
  return normalizeString(editor.getSelectedText());
}

export function isComment(editor, position) {
  const scope = editor.scopeDescriptorForBufferPosition(position);
  const scopeString = scope.getScopeChain();
  return scopeString.includes("comment.line");
}

export function isBlank(editor, row) {
  return editor.getBuffer().isRowBlank(row);
}

export function escapeBlankRows(editor, startRow, endRow) {
  while (endRow > startRow) {
    if (!isBlank(editor, endRow)) {
      break;
    }
    endRow -= 1;
  }

  return endRow;
}

export function getFoldRange(editor, row) {
  const range = rowRangeForCodeFoldAtBufferRow(editor, row);
  if (!range) {
    return;
  }

  if (
    range[1] < editor.getLastBufferRow() &&
    getRow(editor, range[1] + 1) === "end"
  ) {
    range[1] += 1;
  }

  log("getFoldRange:", range);
  return range;
}

export function getFoldContents(editor, row) {
  const range = getFoldRange(editor, row);
  if (!range) {
    return;
  }
  return { code: getRows(editor, range[0], range[1]), row: range[1] };
}

export function getCodeToInspect(editor) {
  const selectedText = getSelectedText(editor);
  let code;
  let cursorPosition;

  if (selectedText) {
    code = selectedText;
    cursorPosition = code.length;
  } else {
    const cursor = editor.getLastCursor();
    const row = cursor.getBufferRow();
    code = getRow(editor, row);
    cursorPosition = cursor.getBufferColumn();
    const identifierEnd = findIdentifierEnd(code, cursorPosition, editor);
    if (identifierEnd !== -1) {
      cursorPosition = identifierEnd;
    }
  }

  cursorPosition = js_idx_to_char_idx(cursorPosition, code);
  return [code, cursorPosition];
}

/**
 * Find the end of an identifier using language-aware regex patterns.
 * Uses the same patterns as autocomplete.js for consistency.
 *
 * @param {string} code - The line of code
 * @param {number} cursorPos - Current cursor position
 * @param {TextEditor} editor - The editor (for language detection)
 * @returns {number} - End position of identifier, or -1 if at end
 */
function findIdentifierEnd(code, cursorPos, editor) {
  if (!code || cursorPos >= code.length) {
    return -1;
  }

  const remaining = code.slice(cursorPos);

  // Get language-specific pattern
  let pattern = /^[\w.]*/; // default: alphanumeric, underscore, dots

  if (editor) {
    const grammarName = editor.getGrammar().name.toLowerCase();

    // Language-specific identifier patterns
    // These match the patterns used in autocomplete.js
    const patterns = {
      // R: allows dots in identifiers
      r: /^([^\W\d]|\.)[\w$.]*/,

      // Python: allows unicode characters
      python: /^([^\W\d]|[\u00A0-\uFFFF])[\w.\u00A0-\uFFFF]*/,

      // PHP: $ prefix for variables
      php: /^[$A-Z_a-z\x7f-\xff][\w\x7f-\xff]*/,

      // Julia: allows ! at end and unicode
      julia: /^([^\W\d]|[\u00A0-\uFFFF])[\w!\u00A0-\uFFFF]*/,

      // JavaScript/TypeScript: allows $ in identifiers
      javascript: /^[\w$.]*/,
      typescript: /^[\w$.]*/,

      // C/C++: standard identifiers
      "c++": /^[\w]*/,
      c: /^[\w]*/,
    };

    pattern = patterns[grammarName] || pattern;
  }

  const match = remaining.match(pattern);

  if (match && match[0].length > 0) {
    return cursorPos + match[0].length;
  }

  return -1;
}

export function getCommentStartString(editor) {
  const result = editor.tokenizedBuffer.commentStringsForPosition(
    editor.getCursorBufferPosition()
  );

  // $FlowFixMe: This is an unofficial API
  const commentStartString = result?.commentStartString;
  if (!commentStartString) {
    log("CellManager: No comment string defined in root scope");
    return null;
  }

  return commentStartString.trimRight();
}

export function getRegexString(editor) {
  const commentStartString = getCommentStartString(editor);
  if (!commentStartString) {
    return null;
  }
  const escapedCommentStartString = escapeStringRegexp(commentStartString);
  const regexString = `${escapedCommentStartString} *%% *(md|markdown)?| *<(codecell|md|markdown)>| *(In\[[0-9 ]*\])`;
  return regexString;
}

export function getBreakpoints(editor) {
  const buffer = editor.getBuffer();
  const breakpoints = [];
  const regexString = getRegexString(editor);

  if (regexString) {
    const regex = new RegExp(regexString, "g");
    buffer.scan(regex, ({ range }) => {
      if (isComment(editor, range.start)) {
        breakpoints.push(range.start);
      }
    });
  }

  breakpoints.push(buffer.getEndPosition());
  log("CellManager: Breakpoints:", breakpoints);
  return breakpoints;
}

function getCell(editor, anyPointInCell) {
  if (!anyPointInCell) {
    anyPointInCell = editor.getCursorBufferPosition();
  }

  const buffer = editor.getBuffer();
  anyPointInCell = new Point(
    anyPointInCell.row,
    buffer.lineLengthForRow(anyPointInCell.row)
  );
  let start = new Point(0, 0);
  let end = buffer.getEndPosition();
  const regexString = getRegexString(editor);

  if (!regexString) {
    return new Range(start, end);
  }

  const regex = new RegExp(regexString);

  if (anyPointInCell.row >= 0) {
    buffer.backwardsScanInRange(
      regex,
      new Range(start, anyPointInCell),
      ({ range }) => {
        start = new Point(range.start.row + 1, 0);
      }
    );
  }

  buffer.scanInRange(regex, new Range(anyPointInCell, end), ({ range }) => {
    end = range.start;
  });
  log(
    "CellManager: Cell [start, end]:",
    [start, end],
    "anyPointInCell:",
    anyPointInCell
  );
  return new Range(start, end);
}

function isEmbeddedCode(editor, referenceScope, row) {
  const scopes = editor
    .scopeDescriptorForBufferPosition(new Point(row, 0))
    .getScopesArray();
  return scopes.includes(referenceScope);
}

function getCurrentFencedCodeBlock(editor) {
  const buffer = editor.getBuffer();
  const { row: bufferEndRow } = buffer.getEndPosition();
  const cursor = editor.getCursorBufferPosition();
  let start = cursor.row;
  let end = cursor.row;
  const scope = getEmbeddedScope(editor, cursor);
  if (!scope) {
    return getCell(editor);
  }

  while (start > 0 && isEmbeddedCode(editor, scope, start - 1)) {
    start -= 1;
  }

  while (end < bufferEndRow && isEmbeddedCode(editor, scope, end + 1)) {
    end += 1;
  }

  return new Range([start, 0], [end + 1, 0]);
}

export function getCurrentCell(editor) {
  if (isMultilanguageGrammar(editor.getGrammar())) {
    return getCurrentFencedCodeBlock(editor);
  }

  return getCell(editor);
}

export function getCells(editor, breakpoints = []) {
  if (breakpoints.length !== 0) {
    breakpoints.sort((a, b) => a.compare(b));
  } else {
    breakpoints = getBreakpoints(editor);
  }

  return getCellsForBreakPoints(editor, breakpoints);
}

export function getCellsForBreakPoints(editor, breakpoints) {
  let start = new Point(0, 0);
  // Let start be earliest row with text
  editor.scan(/\S/, (match) => {
    start = new Point(match.range.start.row, 0);
    match.stop();
  });
  return compact(
    breakpoints.map((end) => {
      const cell = end.isEqual(start) ? null : new Range(start, end);
      start = new Point(end.row + 1, 0);
      return cell;
    })
  );
}

/**
 * Center the screen on cursor position
 */
function centerScreenOnCursorPosition(editor) {
  const cursorPosition = editor.element.pixelPositionForScreenPosition(
    editor.getCursorScreenPosition()
  ).top;
  const editorHeight = editor.element.getHeight();
  editor.element.setScrollTop(cursorPosition - editorHeight / 2);
}

/**
 * Scroll if cursor is below half of the visible area
 * Only scrolls when cursor passes the midpoint of the visible window
 */
function scrollIfBelowHalf(editor) {
  const cursorPosition = editor.element.pixelPositionForScreenPosition(
    editor.getCursorScreenPosition()
  ).top;
  const scrollTop = editor.element.getScrollTop();
  const editorHeight = editor.element.getHeight();
  const halfWindow = scrollTop + editorHeight / 2;

  // Only scroll if cursor is below the midpoint
  if (cursorPosition > halfWindow) {
    // Scroll to put cursor at the midpoint
    editor.element.setScrollTop(cursorPosition - editorHeight / 2);
  }
}

/**
 * Apply scroll behavior based on setting
 * @param {TextEditor} editor
 */
function applyScrollBehavior(editor) {
  const scrollMode = atom.config.get("hydrogen-next.scrollOnMoveDown");

  switch (scrollMode) {
    case "center":
      centerScreenOnCursorPosition(editor);
      break;
    case "halfWindow":
      scrollIfBelowHalf(editor);
      break;
    case "none":
    default:
      // Don't scroll
      break;
  }
}

/**
 * Move cursor down after execution.
 * @param {TextEditor} editor
 * @param {number} endRow - The last row of the executed code
 */
export function moveDown(editor, endRow) {
  const lastRow = editor.getLastBufferRow();

  if (endRow >= lastRow) {
    editor.moveToBottom();
    editor.insertNewline();
    return;
  }

  // Move to next non-blank row after the executed code
  let targetRow = endRow + 1;

  // Skip blank lines
  while (targetRow <= lastRow && isBlank(editor, targetRow)) {
    targetRow++;
  }

  if (targetRow > lastRow) {
    editor.moveToBottom();
    editor.insertNewline();
    return;
  }

  editor.setCursorBufferPosition({ row: targetRow, column: 0 });
  applyScrollBehavior(editor);
}

export function findPrecedingBlock(editor, row, indentLevel) {
  let previousRow = row - 1;

  while (previousRow >= 0) {
    const previousIndentLevel = editor.indentationForBufferRow(previousRow);
    const sameIndent = previousIndentLevel <= indentLevel;
    const blank = isBlank(editor, previousRow);
    const isEnd = getRow(editor, previousRow) === "end";

    if (isBlank(editor, row)) {
      row = previousRow;
    }

    if (sameIndent && !blank && !isEnd) {
      const cell = getCell(editor, new Point(row, 0));

      if (cell.start.row > row) {
        return { code: "", row };
      }

      return { code: getRows(editor, previousRow, row), row };
    }

    previousRow -= 1;
  }

  return null;
}

export function findCodeBlock(editor, selection) {
  if (!selection.isEmpty()) {
    const selectedRange = selection.getBufferRange();
    let startPoint = selectedRange.start;
    let endRow = selectedRange.end.row;
    if (selectedRange.end.column === 0) {
      endRow -= 1;
    }
    endRow = escapeBlankRows(editor, startPoint.row, endRow);
    return {
      code: getTextInRange(editor, startPoint, selectedRange.end),
      row: endRow,
    };
  } else {
    return findCodeBlockAtRow(editor, selection.cursor.getBufferRow());
  }
}

// =============================================================================
// CODE BLOCK DETECTION SYSTEM
// =============================================================================
// Priority order:
// 1. Selection - explicit user choice (handled in findCodeBlock)
// 2. Brackets - multi-line bracket expressions (arrays, dicts, function calls)
// 3. Specials - language-specific patterns (Python if-else, try-except, decorators)
// 4. Folds - language constructs (functions, classes, blocks)
// 5. Single line - fallback to current line
// =============================================================================

// -----------------------------------------------------------------------------
// BRACKET DETECTION
// -----------------------------------------------------------------------------

const BRACKET_PAIRS = {
  '(': ')', '[': ']', '{': '}',
  ')': '(', ']': '[', '}': '{',
};
const OPEN_BRACKETS = new Set(['(', '[', '{']);
const CLOSE_BRACKETS = new Set([')', ']', '}']);

/**
 * Check if character is inside a string or comment (basic heuristic)
 * This is a simplified check - for full accuracy would need tokenizer
 */
function isInStringOrComment(line, charIndex) {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTripleSingle = false;
  let inTripleDouble = false;

  for (let i = 0; i < charIndex; i++) {
    const char = line[i];
    const next2 = line.slice(i, i + 3);

    // Check for triple quotes first
    if (!inSingleQuote && !inDoubleQuote) {
      if (next2 === '"""') {
        inTripleDouble = !inTripleDouble;
        i += 2;
        continue;
      }
      if (next2 === "'''") {
        inTripleSingle = !inTripleSingle;
        i += 2;
        continue;
      }
    }

    if (inTripleSingle || inTripleDouble) continue;

    // Check for escape sequences
    if (char === '\\' && i + 1 < charIndex) {
      i++; // Skip next character
      continue;
    }

    // Check for single/double quotes
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    }

    // Check for line comment (after quotes are handled)
    if (!inSingleQuote && !inDoubleQuote && char === '#') {
      return true; // Rest of line is comment
    }
  }

  return inSingleQuote || inDoubleQuote || inTripleSingle || inTripleDouble;
}

/**
 * Count net brackets in a line (excluding those in strings/comments)
 * Returns { open: count of unmatched opens, close: count of unmatched closes }
 */
function countBracketsInLine(line, bracketType) {
  const openBracket = OPEN_BRACKETS.has(bracketType) ? bracketType : BRACKET_PAIRS[bracketType];
  const closeBracket = BRACKET_PAIRS[openBracket];

  let depth = 0;
  let unmatchedClose = 0;

  for (let i = 0; i < line.length; i++) {
    if (isInStringOrComment(line, i)) continue;

    const char = line[i];
    if (char === openBracket) {
      depth++;
    } else if (char === closeBracket) {
      if (depth > 0) {
        depth--;
      } else {
        unmatchedClose++;
      }
    }
  }

  return { open: depth, close: unmatchedClose };
}

/**
 * Find bracket block that contains the given row
 * Returns { startRow, endRow } or null if not in a bracket block
 *
 * NOTE: Only captures the block if cursor is on the opening or closing bracket line.
 * If cursor is inside the bracket expression (middle lines), returns null to allow
 * single-line execution for inspection purposes.
 */
function findBracketBlock(editor, row) {
  const line = editor.lineTextForBufferRow(row);
  const trimmedLine = line.trim();

  // Check if line starts with closing bracket
  const startsWithClose = /^[\)\]\}]/.test(trimmedLine);
  // Check if line ends with opening bracket
  const endsWithOpen = /[\(\[\{]\s*$/.test(trimmedLine);

  // Only capture bracket blocks when cursor is on opening or closing bracket line
  // If cursor is inside (not on start/end line), return null for single-line execution
  if (!startsWithClose && !endsWithOpen) {
    // Cursor is inside a bracket expression - don't capture, allow single line
    return null;
  }

  if (startsWithClose) {
    // Find matching opening bracket going backwards
    const closeBracket = trimmedLine[0];
    const openBracket = BRACKET_PAIRS[closeBracket];

    let depth = 1;
    for (let r = row - 1; r >= 0; r--) {
      const l = editor.lineTextForBufferRow(r);
      for (let i = l.length - 1; i >= 0; i--) {
        if (isInStringOrComment(l, i)) continue;
        const char = l[i];
        if (char === closeBracket) {
          depth++;
        } else if (char === openBracket) {
          depth--;
          if (depth === 0) {
            return { startRow: r, endRow: row };
          }
        }
      }
    }
  }

  if (endsWithOpen) {
    // Find matching closing bracket going forwards
    const match = trimmedLine.match(/[\(\[\{]\s*$/);
    const openBracket = match[0].trim();
    const closeBracket = BRACKET_PAIRS[openBracket];

    let depth = 1;
    const lastRow = editor.getLastBufferRow();
    for (let r = row + 1; r <= lastRow; r++) {
      const l = editor.lineTextForBufferRow(r);
      for (let i = 0; i < l.length; i++) {
        if (isInStringOrComment(l, i)) continue;
        const char = l[i];
        if (char === openBracket) {
          depth++;
        } else if (char === closeBracket) {
          depth--;
          if (depth === 0) {
            return { startRow: row, endRow: r };
          }
        }
      }
    }
  }

  return null;
}

// -----------------------------------------------------------------------------
// MAIN CODE BLOCK DETECTION
// -----------------------------------------------------------------------------

export function findCodeBlockAtRow(editor, row) {
  log("findCodeBlockAtRow:", row);

  // If current line is blank, scan upward to find the nearest non-blank line
  if (isBlank(editor, row)) {
    let scanRow = row - 1;
    while (scanRow >= 0 && isBlank(editor, scanRow)) {
      scanRow--;
    }
    if (scanRow < 0) {
      return null;
    }
    row = scanRow;
    log("findCodeBlockAtRow: scanned up to row", row);
  }

  // 1. Check for language-specific specials (Python if-else, try-except, decorators)
  const specialBlock = getLanguageSpecialBlock(editor, row);
  if (specialBlock) {
    return { code: specialBlock.code, row: specialBlock.endRow };
  }

  // 2. Check for bracket-based blocks
  const bracketBlock = findBracketBlock(editor, row);
  if (bracketBlock) {
    const { startRow, endRow } = bracketBlock;
    // Only use bracket block if it spans multiple lines
    if (startRow !== endRow) {
      return { code: getRows(editor, startRow, endRow), row: endRow };
    }
  }

  // 3. Check for fold-based blocks
  const indentLevel = editor.indentationForBufferRow(row);
  let foldable = editor.isFoldableAtBufferRow(row);
  const foldRange = rowRangeForCodeFoldAtBufferRow(editor, row);
  if (!foldRange || foldRange[0] == null || foldRange[1] == null) {
    foldable = false;
  }
  if (foldable) {
    return getFoldContents(editor, row);
  }

  // 4. Handle special "end" keyword (Ruby, Lua, etc.)
  if (getRow(editor, row) === "end") {
    return findPrecedingBlock(editor, row, indentLevel);
  }

  // 5. Check cell boundaries
  const cell = getCell(editor, new Point(row, 0));
  if (cell.start.row > row) {
    return { code: "", row };
  }

  // 6. Fallback to single line
  return { code: getRow(editor, row), row };
}

// -----------------------------------------------------------------------------
// LANGUAGE-SPECIFIC SPECIALS
// -----------------------------------------------------------------------------

/**
 * Get language-specific code block (currently Python support)
 * Returns { code, startRow, endRow } or null
 *
 * Language-specific detection is applied only when:
 * 1. The editor grammar matches the expected language (e.g., source.python)
 * 2. The running kernel's language matches (e.g., python)
 *
 * This ensures Python-specific block detection (if-else chains, decorators, etc.)
 * only applies when actually running Python code in a Python kernel.
 */
function getLanguageSpecialBlock(editor, row) {
  const grammar = editor.getGrammar();
  if (!grammar) return null;

  const scopeName = grammar.scopeName;
  const kernel = store.kernel;
  const kernelLanguage = kernel?.language?.toLowerCase();

  // Python: requires both Python grammar AND Python kernel
  if (scopeName === "source.python" && kernelLanguage === "python") {
    return getPythonSpecialBlock(editor, row);
  }

  // Add more language handlers here as needed
  // if (scopeName === "source.ruby" && kernelLanguage === "ruby") {
  //   return getRubySpecialBlock(editor, row);
  // }

  return null;
}

/**
 * Try to get tree-sitter syntax node at position
 * Returns the node or null if tree-sitter is not available
 */
function getSyntaxNodeAtPosition(editor, position) {
  try {
    const languageMode = editor.buffer.getLanguageMode();
    if (languageMode && typeof languageMode.getSyntaxNodeAtPosition === 'function') {
      return languageMode.getSyntaxNodeAtPosition(position);
    }
  } catch (e) {
    // Tree-sitter not available or error
  }
  return null;
}

/**
 * Get the syntax node range as { startRow, endRow }
 */
function getNodeRange(node) {
  if (!node) return null;
  return {
    startRow: node.startPosition.row,
    endRow: node.endPosition.row
  };
}

/**
 * Python tree-sitter node types that represent complete blocks
 */
const PYTHON_BLOCK_TYPES = new Set([
  'function_definition',
  'class_definition',
  'if_statement',
  'for_statement',
  'while_statement',
  'try_statement',
  'with_statement',
  'match_statement',
  'decorated_definition'
]);

/**
 * Python tree-sitter node types that are parts of compound statements
 */
const PYTHON_CLAUSE_TYPES = new Set([
  'elif_clause',
  'else_clause',
  'except_clause',
  'finally_clause',
  'case_clause'
]);

/**
 * Python-specific block detection using tree-sitter when available
 * Falls back to regex-based detection otherwise
 *
 * Supported constructs:
 * - Functions/classes with decorators
 * - if-elif-else chains
 * - try-except-else-finally blocks
 * - with statements
 * - for/while loops with else
 * - match/case statements
 */
function getPythonSpecialBlock(editor, row) {
  const currentLine = editor.lineTextForBufferRow(row);
  const trimmedLine = currentLine.trim();

  // Skip empty lines
  if (trimmedLine.length === 0) return null;

  // Try tree-sitter first for accurate detection
  const node = getSyntaxNodeAtPosition(editor, new Point(row, 0));
  if (node) {
    const result = getPythonBlockFromNode(editor, node, row);
    if (result) return result;
  }

  // Fallback to regex-based detection
  return getPythonSpecialBlockFallback(editor, row, trimmedLine);
}

/**
 * Get Python block from tree-sitter node
 * Only returns a block if the cursor is on a "control" line (def, class, if, elif, else, etc.)
 * If cursor is inside the body, returns null to allow single-line execution
 */
function getPythonBlockFromNode(editor, node, row) {
  // Walk up the tree to find a block node
  let current = node;

  while (current) {
    const nodeType = current.type;

    // If this is a complete block type
    if (PYTHON_BLOCK_TYPES.has(nodeType)) {
      // Only capture the block if cursor is on the FIRST line of the block
      // (the control statement line like 'def', 'class', 'if', etc.)
      if (current.startPosition.row === row) {
        return extractPythonBlock(editor, current);
      }
      // If cursor is inside the body, don't capture - let it fall through to single line
      return null;
    }

    // If we're in a clause (elif, else, except, finally)
    if (PYTHON_CLAUSE_TYPES.has(nodeType)) {
      // Only capture if cursor is on the clause line itself
      if (current.startPosition.row === row) {
        // Get the parent compound statement
        let parent = current.parent;
        while (parent && !PYTHON_BLOCK_TYPES.has(parent.type)) {
          parent = parent.parent;
        }
        if (parent) {
          return extractPythonBlock(editor, parent);
        }
      }
      // If cursor is inside the clause body, don't capture
      return null;
    }

    // Check if we're on a decorator
    if (nodeType === 'decorator') {
      // Only capture if cursor is on the decorator line
      if (current.startPosition.row === row) {
        // Find decorated_definition parent
        let parent = current.parent;
        if (parent && parent.type === 'decorated_definition') {
          return extractPythonBlock(editor, parent);
        }
      }
      return null;
    }

    current = current.parent;
  }

  return null;
}

/**
 * Extract code block from a tree-sitter node
 */
function extractPythonBlock(editor, node) {
  const startRow = node.startPosition.row;
  // endPosition.row is inclusive for the last line, but we need to handle
  // whether the end position is at column 0 (meaning line above)
  let endRow = node.endPosition.row;
  if (node.endPosition.column === 0 && endRow > startRow) {
    endRow -= 1;
  }

  const code = editor.getTextInBufferRange([
    [startRow, 0],
    [endRow + 1, 0],
  ]);

  return { code: normalizeString(code), startRow, endRow };
}

/**
 * Fallback regex-based Python block detection
 * Only captures blocks when cursor is on the control line, not inside body
 */
function getPythonSpecialBlockFallback(editor, row, trimmedLine) {
  // Check for decorator - find the function/class it decorates
  // Decorators are always "control" lines
  if (trimmedLine.startsWith('@')) {
    return getPythonDecoratedBlock(editor, row);
  }

  // Check for function or class definition
  // Only captures when cursor is on the 'def' or 'class' line
  if (/^(async\s+)?def\s+\w+|^class\s+\w+/.test(trimmedLine)) {
    return getPythonFunctionOrClassBlock(editor, row);
  }

  // Check for compound statements: if, try, for, while, with (start)
  // Only captures when cursor is on the starting control line
  if (/^(if|try|for|while|with|match)\s/.test(trimmedLine) && trimmedLine.endsWith(':')) {
    return getPythonCompoundBlock(editor, row);
  }

  // Check for continuation clauses (elif, else, except, finally, case)
  // Only captures when cursor is on the clause line itself
  if (/^(elif|else|except|finally|case)\s*.*:$/.test(trimmedLine)) {
    return getPythonContinuationBlock(editor, row);
  }

  // If cursor is inside a body (indented line that's not a control statement),
  // return null to allow single-line execution
  return null;
}

export function foldCurrentCell(editor) {
  const cellRange = getCurrentCell(editor);
  const newRange = adjustCellFoldRange(editor, cellRange);
  editor.setSelectedBufferRange(newRange);
  editor.getSelections()[0].fold();
}

export function foldAllButCurrentCell(editor) {
  const initialSelections = editor.getSelectedBufferRanges();
  // I take .slice(1) because there's always an empty cell range from [0,0] to
  // [0,0]
  const allCellRanges = getCells(editor).slice(1);
  const currentCellRange = getCurrentCell(editor);
  const newRanges = allCellRanges
    .filter((cellRange) => !cellRange.isEqual(currentCellRange))
    .map((cellRange) => adjustCellFoldRange(editor, cellRange));
  editor.setSelectedBufferRanges(newRanges);
  editor.getSelections().forEach((selection) => selection.fold());
  // Restore selections
  editor.setSelectedBufferRanges(initialSelections);
}

function adjustCellFoldRange(editor, range) {
  const startRow = range.start.row > 0 ? range.start.row - 1 : 0;
  const startWidth = editor.lineTextForBufferRow(startRow).length;
  const endRow =
    range.end.row == editor.getLastBufferRow()
      ? range.end.row
      : range.end.row - 1;
  const endWidth = editor.lineTextForBufferRow(endRow).length;
  return new Range(
    new Point(startRow, startWidth),
    new Point(endRow, endWidth)
  );
}

export function getEscapeBlankRowsEndRow(editor, end) {
  return end.row === editor.getLastBufferRow() ? end.row : end.row - 1;
}

// -----------------------------------------------------------------------------
// PYTHON SPECIAL BLOCK HELPERS
// -----------------------------------------------------------------------------

/**
 * Find the end row of a Python indented block
 * @param {TextEditor} editor
 * @param {number} startRow - Row where the block starts (def/class/if/etc.)
 * @param {number} baseIndent - Indentation level of the starting row
 * @returns {number} The last row of the block (excluding trailing blank lines)
 */
function findPythonBlockEnd(editor, startRow, baseIndent) {
  const lineCount = editor.getLineCount();
  let endRow = startRow;
  let lastNonEmpty = startRow;

  for (let i = startRow + 1; i < lineCount; i++) {
    const text = editor.lineTextForBufferRow(i);

    // Skip blank lines (include them in block but track last non-empty)
    if (text.trim().length === 0) {
      continue;
    }

    const ilvl = editor.indentationForBufferRow(i);

    // If indentation is greater than base, it's part of the block
    if (ilvl > baseIndent) {
      endRow = i;
      lastNonEmpty = i;
    } else {
      // Block ends here
      break;
    }
  }

  return lastNonEmpty;
}

/**
 * Look backwards from a row to find all decorators
 * @returns {number} The row of the first decorator, or startRow if none
 */
function findPythonDecoratorStart(editor, startRow) {
  let decoratorStart = startRow;

  for (let i = startRow - 1; i >= 0; i--) {
    const line = editor.lineTextForBufferRow(i);
    const trimmed = line.trim();

    // Skip blank lines
    if (trimmed.length === 0) continue;

    // Check for decorator
    if (trimmed.startsWith('@')) {
      decoratorStart = i;
    } else {
      // Non-decorator, non-blank line ends the search
      break;
    }
  }

  return decoratorStart;
}

/**
 * Handle decorated blocks (cursor on @decorator line)
 */
function getPythonDecoratedBlock(editor, row) {
  const lineCount = editor.getLineCount();

  // Find the function/class this decorator applies to
  let functionRow = null;
  for (let i = row + 1; i < lineCount; i++) {
    const line = editor.lineTextForBufferRow(i);
    const trimmed = line.trim();

    // Skip blank lines and other decorators
    if (trimmed.length === 0 || trimmed.startsWith('@')) continue;

    // Check for function/class definition
    if (/^(async\s+)?def\s+\w+|^class\s+\w+/.test(trimmed)) {
      functionRow = i;
    }
    break;
  }

  if (functionRow === null) return null;

  // Find all decorators above the original row
  const decoratorStart = findPythonDecoratorStart(editor, row);

  // Find end of function/class body
  const baseIndent = editor.indentationForBufferRow(functionRow);
  const endRow = findPythonBlockEnd(editor, functionRow, baseIndent);

  const code = editor.getTextInBufferRange([
    [decoratorStart, 0],
    [endRow + 1, 0],
  ]);

  return { code: normalizeString(code), startRow: decoratorStart, endRow };
}

/**
 * Handle function/class definitions (with potential decorators above)
 */
function getPythonFunctionOrClassBlock(editor, row) {
  // Look for decorators above
  const decoratorStart = findPythonDecoratorStart(editor, row);

  // Find end of function/class body
  const baseIndent = editor.indentationForBufferRow(row);
  const endRow = findPythonBlockEnd(editor, row, baseIndent);

  const code = editor.getTextInBufferRange([
    [decoratorStart, 0],
    [endRow + 1, 0],
  ]);

  return { code: normalizeString(code), startRow: decoratorStart, endRow };
}

/**
 * Handle continuation clauses (elif, else, except, finally) by finding the parent block
 */
function getPythonContinuationBlock(editor, row) {
  const currentIndent = editor.indentationForBufferRow(row);
  const trimmedLine = editor.lineTextForBufferRow(row).trim();

  // Determine what kind of parent we're looking for
  let parentPattern;
  if (trimmedLine.startsWith('elif') || trimmedLine.startsWith('else')) {
    // Could be if-elif-else or for/while-else or try-else
    parentPattern = /^(if|elif|for|while|try|except)\s/;
  } else if (trimmedLine.startsWith('except') || trimmedLine.startsWith('finally')) {
    parentPattern = /^(try|except)\s/;
  }

  // Look backwards for the parent statement at same indentation
  for (let i = row - 1; i >= 0; i--) {
    const line = editor.lineTextForBufferRow(i);
    const trimmed = line.trim();

    if (trimmed.length === 0) continue;

    const ilvl = editor.indentationForBufferRow(i);

    // If same indentation, check if it's the start of compound statement
    if (ilvl === currentIndent) {
      if (/^(if|try|for|while)\s/.test(trimmed) && trimmed.endsWith(':')) {
        // Found the start - delegate to compound block handler
        return getPythonCompoundBlock(editor, i);
      }
      // If it's another continuation clause, keep looking
      if (!parentPattern.test(trimmed)) {
        // Hit something else at same level - this continuation is orphaned
        break;
      }
    } else if (ilvl < currentIndent) {
      // Went past the parent's indentation level
      break;
    }
  }

  return null;
}

/**
 * Handle compound statements: if-elif-else, try-except-finally, for-else, while-else, with
 */
function getPythonCompoundBlock(editor, startRow) {
  const lineCount = editor.getLineCount();
  const baseIndent = editor.indentationForBufferRow(startRow);
  let endRow = startRow;
  let lastNonEmpty = startRow;

  // Determine which continuation keywords to look for
  const startLine = editor.lineTextForBufferRow(startRow).trim();
  let continuationPattern;

  if (startLine.startsWith('if')) {
    continuationPattern = /^(elif|else)\s*.*:$/;
  } else if (startLine.startsWith('try')) {
    continuationPattern = /^(except|else|finally)\s*.*:$/;
  } else if (startLine.startsWith('for') || startLine.startsWith('while')) {
    continuationPattern = /^else\s*:$/;
  } else if (startLine.startsWith('with')) {
    continuationPattern = null; // 'with' has no continuation clauses
  }

  for (let i = startRow + 1; i < lineCount; i++) {
    const text = editor.lineTextForBufferRow(i);
    const trimmed = text.trim();

    // Skip blank lines
    if (trimmed.length === 0) continue;

    const ilvl = editor.indentationForBufferRow(i);

    // If more indented, it's part of current clause body
    if (ilvl > baseIndent) {
      endRow = i;
      lastNonEmpty = i;
      continue;
    }

    // If less indented, block ends
    if (ilvl < baseIndent) break;

    // Same indentation - check for continuation clause
    if (continuationPattern && continuationPattern.test(trimmed)) {
      endRow = i;
      lastNonEmpty = i;
      continue;
    }

    // Same indentation but not a continuation - block ends
    break;
  }

  const code = editor.getTextInBufferRange([
    [startRow, 0],
    [lastNonEmpty + 1, 0],
  ]);

  return { code: normalizeString(code), startRow, endRow: lastNonEmpty };
}

export function prepareCellDecoration(editor) {
  const buffer = editor.buffer;
  if (!buffer.hbpSubscription) {
    buffer.hbpMarkerLayer = buffer.addMarkerLayer({
      role: "hydrogen-next-breakpoints",
    });
  }
  editor.decorateMarkerLayer(editor.buffer.hbpMarkerLayer, {
    type: "line",
    class: "hydrogen-next-breakpoint",
  });
}

export function updateCellMarkers(editor) {
  const buffer = editor.buffer;
  if (!buffer.hbpMarkerLayer) {
    return;
  }
  buffer.hbpMarkerLayer.clear();
  const breakpoints = getBreakpoints(editor).slice(0, -1);
  for (const breakpoint of breakpoints) {
    buffer.hbpMarkerLayer.markRange([breakpoint, [breakpoint.row, 1e9]], {
      invalidate: "surround",
      exclusive: true,
    });
  }
}

export function destroyCellMarkers(editor) {
  const buffer = editor.buffer;
  if (!buffer.hbpMarkerLayer) {
    return;
  }
  buffer.hbpMarkerLayer.clear();
  buffer.hbpMarkerLayer.destroy();
  delete buffer.hbpMarkerLayer;
}
