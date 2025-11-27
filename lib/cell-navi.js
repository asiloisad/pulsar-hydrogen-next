/** @babel */

import { Range } from "atom";
import store from "./store";
import { getRegexString } from "./code-manager";

function cursorRowEnd() {
  let currentRow;
  currentRow = store.editor.getCursorBufferPosition().row;
  return store.editor.buffer.rangeForRow(currentRow).end;
}

function rowEnd(row) {
  return store.editor.buffer.rangeForRow(row).end;
}

function cellRange() {
  let bufferEnd,
    editor,
    endPos,
    lowerCellPos,
    lowerRange,
    startRow,
    upperCellPos,
    upperRange;
  editor = store.editor;
  const cellregex = new RegExp(getRegexString(editor), "g");
  bufferEnd = editor.buffer.getEndPosition();
  startRow = editor.getSelectedBufferRange().start.row;
  upperRange = new Range([0, 0], rowEnd(startRow));
  endPos = editor.getSelectedBufferRange().end;
  if (startRow === endPos.row) {
    endPos = rowEnd(endPos.row);
  }
  lowerRange = new Range(endPos, bufferEnd);
  upperCellPos = [0, 0];
  lowerCellPos = bufferEnd;
  editor.backwardsScanInBufferRange(cellregex, upperRange, (match) => {
    upperCellPos = match.range.start;
    return match.stop();
  });
  editor.scanInBufferRange(cellregex, lowerRange, (match) => {
    lowerCellPos = match.range.start;
    return match.stop();
  });
  return new Range(upperCellPos, lowerCellPos);
}

function getCellRows(range, funcName) {
  let cellRows, maxRow;
  cellRows = [];
  maxRow = {
    scanInBufferRange: 0,
    backwardsScanInBufferRange: 1,
  };
  const cellregex = new RegExp(getRegexString(store.editor), "g");
  store.editor[funcName](cellregex, range, (match) => {
    cellRows.push(match.range.start.row);
    if (cellRows.length > maxRow[funcName]) {
      return match.stop();
    }
  });
  return cellRows;
}

function reverseSelect(range) {
  return store.editor.setSelectedBufferRange(range, {
    reversed: true,
  });
}

export function selectCell() {
  return reverseSelect(cellRange());
}

export function selectDown() {
  let currentRange, downRange;
  currentRange = cellRange();
  store.editor.setCursorBufferPosition(currentRange.end);
  downRange = cellRange();
  return store.editor.setSelectedBufferRange([
    currentRange.start,
    downRange.end,
  ]);
}

export function selectUp() {
  let currentRange, upRange, upRow;
  currentRange = cellRange();
  upRow = currentRange.start.row - 1;
  if (upRow < 0) {
    upRow = 0;
  }
  store.editor.setCursorBufferPosition([upRow, 0]);
  upRange = cellRange();
  return reverseSelect([upRange.start, currentRange.end]);
}

export function nextCell() {
  let bufferEnd, cellRows, range;
  bufferEnd = store.editor.buffer.getEndPosition();
  range = new Range(cursorRowEnd(), bufferEnd);
  cellRows = getCellRows(range, "scanInBufferRange");
  if (cellRows.length === 0) {
    return;
  }
  if (cellRows[0] === bufferEnd.row) {
    return;
  }
  return store.editor.setCursorBufferPosition([cellRows[0] + 1, 0]);
}

export function previousCell() {
  let cellRows, range;
  range = new Range([0, 0], cursorRowEnd());
  cellRows = getCellRows(range, "backwardsScanInBufferRange");
  if (cellRows.length === 0) {
    return;
  }
  if (cellRows.length === 1) {
    if (cellRows[0] === 0) {
      return;
    } else {
      return store.editor.setCursorBufferPosition([0, 0]);
    }
  }
  return store.editor.setCursorBufferPosition([cellRows[1] + 1, 0]);
}

export function moveCellUp() {
  let cellrange, editor, insertPos, range;
  editor = store.editor;
  const cellregex = new RegExp(getRegexString(editor), "g");
  cellrange = cellRange();
  if (cellrange.start.row === 0) {
    return reverseSelect(cellrange);
  }
  range = new Range([0, 0], cellrange.start);
  insertPos = [0, 0];
  editor.backwardsScanInBufferRange(cellregex, range, (match) => {
    insertPos = match.range.start;
    return match.stop();
  });
  return editor.transact(() => {
    let insertRanges, txt;
    txt = editor.getTextInBufferRange(cellrange);
    if (!txt.endsWith("\n")) {
      txt += "\n";
    }
    editor.buffer["delete"](cellrange);
    if (
      insertPos[0] === 0 &&
      editor.buffer.lineForRow(0).search(cellregex) !== 0
    ) {
      editor.buffer.insert(insertPos, "# %%\n");
    }
    editor.setCursorBufferPosition(insertPos);
    insertRanges = editor.insertText(txt);
    return reverseSelect(insertRanges[0]);
  });
}

export function moveCellDown() {
  let bufferEnd, cellrange, editor, insertPos, range, searchStart;
  editor = store.editor;
  const cellregex = new RegExp(getRegexString(editor), "g");
  cellrange = cellRange();
  bufferEnd = editor.buffer.getEndPosition();
  if (cellrange.end.row === bufferEnd.row) {
    return reverseSelect(cellrange);
  }
  searchStart = editor.buffer.rangeForRow(cellrange.end.row).end;
  range = new Range(searchStart, bufferEnd);
  insertPos = bufferEnd;
  editor.scanInBufferRange(cellregex, range, (match) => {
    insertPos = match.range.start;
    return match.stop();
  });
  return editor.transact(() => {
    let insertRanges, txt;
    txt = editor.getTextInBufferRange(cellrange);
    if (txt.search(cellregex) !== 0) {
      txt = "# %%\n" + txt;
    }
    editor.setCursorBufferPosition(insertPos);
    if (bufferEnd.column !== 0) {
      editor.buffer.append("\n");
    }
    insertRanges = editor.insertText(txt);
    reverseSelect(insertRanges[0]);
    return editor.buffer["delete"](cellrange);
  });
}
