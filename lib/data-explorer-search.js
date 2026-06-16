/** @babel */

import { Emitter } from "atom";

// Same cell formatting the grid uses, so matches line up with what is shown.
function formatCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

/**
 * Search adapter for the Data Explorer grid, consumed by search-panel through
 * the search-adapter service. It scans the loaded payload's cell text, tracks
 * an ordered match list (one entry per matching cell), and drives the grid to
 * highlight matches and reveal the current one. The grid is read-only, so
 * replace is not supported (canReplace = false).
 */
export default class DataExplorerSearchAdapter {
  canReplace = false;

  constructor(store) {
    this.store = store;
    this.emitter = new Emitter();
    this.matches = []; // ordered [{ r, c }]
    this.currentIndex = -1;
    // Snapshot of the last query, so re-scanning on data change is independent
    // of the shared FindOptions (which a search elsewhere may have changed).
    this.test = null;
  }

  onDidUpdate(callback) {
    return this.emitter.on("did-update", callback);
  }

  onDidChangeCurrentResult(callback) {
    return this.emitter.on("did-change-current-result", callback);
  }

  onDidError(callback) {
    return this.emitter.on("did-error", callback);
  }

  search(findOptions) {
    const pattern = findOptions.findPattern;
    if (!pattern) {
      this.test = null;
      this._setMatches([], -1);
      return;
    }
    let regex;
    try {
      regex = findOptions.getFindPatternRegex();
    } catch (e) {
      this.test = null;
      this.emitter.emit("did-error", e);
      this._setMatches([], -1);
      return;
    }
    // A non-global clone so test() is stateless across cells.
    this.test = new RegExp(regex.source, regex.flags.replace("g", ""));
    this._scan();
  }

  // Re-run the last query after the grid's data changed (drill / navigate).
  dataChanged() {
    if (this.test) {
      this._scan();
    } else {
      this._setMatches([], -1);
    }
  }

  _scan() {
    const payload = this.store.payload;
    const matches = [];
    if (this.test && payload && Array.isArray(payload.rows) && Array.isArray(payload.columns)) {
      const ncols = payload.columns.length;
      for (let r = 0; r < payload.rows.length; r++) {
        const row = payload.rows[r];
        for (let c = 0; c < ncols; c++) {
          const text = formatCell(row[c]);
          if (text && this.test.test(text)) {
            matches.push({ r, c });
          }
        }
      }
    }
    this._setMatches(matches, -1);
  }

  _setMatches(matches, currentIndex) {
    this.matches = matches;
    this.currentIndex = currentIndex;
    this.store.setSearchMatches(matches, currentIndex);
    this.emitter.emit("did-update");
  }

  getResultCount() {
    return this.matches.length;
  }

  getCurrentResultIndex() {
    return this.currentIndex;
  }

  // Row-major comparison of two cells.
  _compare(a, b) {
    return a.r - b.r || a.c - b.c;
  }

  // The position navigation is relative to: the grid's active cell when there is
  // a selection, otherwise just before the first cell so "next" finds match #1.
  _anchor() {
    const grid = this.store.activeGrid;
    if (grid && grid.hasSelection && grid.hasSelection() && grid.activeCell) {
      const cell = grid.activeCell();
      return { r: cell.r, c: cell.c };
    }
    return { r: 0, c: -1 };
  }

  selectNext() {
    if (this.matches.length === 0) return { found: false, wrapped: null };
    const anchor = this._anchor();
    let index = this.matches.findIndex((m) => this._compare(m, anchor) > 0);
    let wrapped = null;
    if (index === -1) {
      index = 0;
      wrapped = "up";
    }
    return this._reveal(index, wrapped);
  }

  selectFirstFromCursor() {
    if (this.matches.length === 0) return { found: false, wrapped: null };
    const anchor = this._anchor();
    let index = this.matches.findIndex((m) => this._compare(m, anchor) >= 0);
    let wrapped = null;
    if (index === -1) {
      index = 0;
      wrapped = "up";
    }
    return this._reveal(index, wrapped);
  }

  selectPrevious() {
    if (this.matches.length === 0) return { found: false, wrapped: null };
    const anchor = this._anchor();
    let index = -1;
    for (let i = this.matches.length - 1; i >= 0; i--) {
      if (this._compare(this.matches[i], anchor) < 0) {
        index = i;
        break;
      }
    }
    let wrapped = null;
    if (index === -1) {
      index = this.matches.length - 1;
      wrapped = "down";
    }
    return this._reveal(index, wrapped);
  }

  selectAll() {
    if (this.matches.length === 0) return { found: false, wrapped: null };
    const grid = this.store.activeGrid;
    if (grid && grid.selectCells) {
      grid.selectCells(this.matches);
    }
    // Mark the first as current without overriding the multi-cell selection.
    this.currentIndex = 0;
    this.store.setSearchMatches(this.matches, 0);
    this.emitter.emit("did-change-current-result", 0);
    return { found: true, wrapped: null };
  }

  _reveal(index, wrapped) {
    this.currentIndex = index;
    this.store.setSearchMatches(this.matches, index);
    const grid = this.store.activeGrid;
    if (grid && grid.revealSearchMatch) {
      grid.revealSearchMatch(this.matches[index]);
    }
    this.emitter.emit("did-change-current-result", index);
    return { found: true, wrapped };
  }

  hasSelectionMatchingResult() {
    const grid = this.store.activeGrid;
    if (!grid || !grid.hasSelection || !grid.hasSelection() || !grid.activeCell) {
      return false;
    }
    const cell = grid.activeCell();
    return this.matches.some((m) => m.r === cell.r && m.c === cell.c);
  }

  isSelectionEmpty() {
    const grid = this.store.activeGrid;
    return grid && grid.hasSelection ? !grid.hasSelection() : true;
  }

  getSelectedText() {
    const grid = this.store.activeGrid;
    const payload = this.store.payload;
    if (!grid || !grid.hasSelection || !grid.hasSelection() || !grid.activeCell || !payload) {
      return "";
    }
    const { r, c } = grid.activeCell();
    const row = payload.rows && payload.rows[r];
    return row ? formatCell(row[c]) : "";
  }

  getWordUnderCursor() {
    return this.getSelectedText();
  }

  getWrapIconHost() {
    const grid = this.store.activeGrid;
    return grid && grid.wrapRef && grid.wrapRef.current ? grid.wrapRef.current : null;
  }

  // Clear matches/highlights when the Data Explorer is no longer the active
  // search target (e.g. focus moved to another pane).
  deactivate() {
    this.test = null;
    this.matches = [];
    this.currentIndex = -1;
    this.store.setSearchMatches([], -1);
  }

  destroy() {
    this.emitter.dispose();
  }
}
