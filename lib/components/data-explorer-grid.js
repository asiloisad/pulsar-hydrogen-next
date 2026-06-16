/** @babel */
/** @jsx React.createElement */

import React from "react";
import { observer } from "mobx-react";

// Horizontal cell padding (px), and the clamp on auto-measured column widths.
const PAD_X = 8;
const MIN_COL = 48;
const MAX_COL = 360;
// Rows sampled (header + first N) when auto-sizing columns, so very large
// frames don't pay to measure every cell.
const SAMPLE_ROWS = 200;

function formatCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

/**
 * Canvas-rendered data grid.
 *
 * The whole grid is a single <canvas> drawn imperatively, so it lives on one GPU
 * compositing layer. That makes it immune to the focus/blur re-raster that an
 * HTML table suffers (a table shares the pane's layer, so any pane-chrome change
 * forces the browser to repaint every bordered/sticky cell). It also keeps the
 * DOM at one node regardless of row count and only ever paints the visible
 * window, so it scales well past the row cap.
 *
 * Scrolling stays native: an absolutely-positioned sizer establishes the
 * scrollable area and the canvas is `position: sticky` so it stays pinned over
 * the viewport; on scroll we just redraw the visible cells.
 */
class CanvasGrid extends React.Component {
  wrapRef = React.createRef();
  sizerRef = React.createRef();
  canvasRef = React.createRef();

  // Selection rectangles in data coordinates (column indices exclude the index
  // column). The active rectangle is anchored at (r0,c0) and extended to (r1,c1).
  sel = null;
  selections = [];
  dragging = false;
  focused = false;
  _rafPending = false;

  componentDidMount() {
    this.ctx = this.canvasRef.current.getContext("2d");
    this.readTheme();
    this.computeLayout();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.wrapRef.current);
    this._themeDisposable = atom.themes.onDidChangeActiveThemes(() => {
      // Themes reload asynchronously; re-read colors/fonts on the next tick.
      setTimeout(() => {
        if (!this.wrapRef.current) {
          return;
        }
        this.readTheme();
        this.computeLayout();
        this.handleResize();
      }, 0);
    });
    const command = (callback) => (event) => this.runGridCommand(event, callback);
    const move = (deltaR, deltaC, extend = false) =>
      command(() => this.moveActiveSelection(deltaR, deltaC, extend));
    const navigate = (deltaR, deltaC) => command(() => this.navigate(deltaR, deltaC));
    const moveTo = (row, col, extend = false) =>
      command(() => this.moveActiveSelectionTo(row, col, extend));
    const page = (direction, extend = false) =>
      command(() => this.moveActiveSelection(direction * this.pageRowCount(), 0, extend));

    this._commands = atom.commands.add(this.wrapRef.current, {
      "core:move-up": navigate(-1, 0),
      "core:move-down": navigate(1, 0),
      "core:move-left": navigate(0, -1),
      "core:move-right": navigate(0, 1),
      "core:select-up": move(-1, 0, true),
      "core:select-down": move(1, 0, true),
      "core:select-left": move(0, -1, true),
      "core:select-right": move(0, 1, true),
      "core:move-to-top": moveTo(0, 0),
      "core:move-to-bottom": command(() => {
        const { nRows, nCols } = this.gridSize();
        this.moveActiveSelectionTo(nRows - 1, nCols - 1);
      }),
      "core:select-to-top": moveTo(0, 0, true),
      "core:select-to-bottom": command(() => {
        const { nRows, nCols } = this.gridSize();
        this.moveActiveSelectionTo(nRows - 1, nCols - 1, true);
      }),
      "hydrogen-next:data-grid-page-up": page(-1),
      "hydrogen-next:data-grid-page-down": page(1),
      "hydrogen-next:data-grid-select-page-up": page(-1, true),
      "hydrogen-next:data-grid-select-page-down": page(1, true),
      "hydrogen-next:data-grid-move-to-row-start": moveTo(null, 0),
      "hydrogen-next:data-grid-move-to-row-end": command(() => {
        const { nCols } = this.gridSize();
        this.moveActiveSelectionTo(null, nCols - 1);
      }),
      "hydrogen-next:data-grid-select-to-row-start": moveTo(null, 0, true),
      "hydrogen-next:data-grid-select-to-row-end": command(() => {
        const { nCols } = this.gridSize();
        this.moveActiveSelectionTo(null, nCols - 1, true);
      }),
      "hydrogen-next:data-grid-select-row": command(() => this.selectActiveRow()),
      "hydrogen-next:data-grid-select-column": command(() => this.selectActiveColumn()),
      "core:confirm": command(() => this.drillActiveRow()),
    });
    this.handleResize();
    // Restore the position saved when this level was last left; otherwise centre
    // on any plot-jump row.
    if (this.props.restoreState) {
      this.restoreState(this.props.restoreState);
      this.props.onRestored?.();
    } else {
      this.scrollToSelected();
    }
  }

  componentDidUpdate(prev) {
    if (prev.payload !== this.props.payload) {
      this.sel = null;
      this.selections = [];
      this.readTheme();
      this.computeLayout();
      this.handleResize();
    }
    if (prev.selectedRow !== this.props.selectedRow) {
      this.scrollToSelected();
    }
    this.scheduleDraw();
  }

  componentWillUnmount() {
    this.resizeObserver?.disconnect();
    this._themeDisposable?.dispose();
    this._commands?.dispose();
    window.removeEventListener("mousemove", this.handleWindowMouseMove);
    window.removeEventListener("mouseup", this.handleWindowMouseUp);
  }

  // Read fonts and palette from CSS (custom properties on the wrapper) so the
  // canvas matches the active Pulsar theme.
  readTheme() {
    const cs = getComputedStyle(this.wrapRef.current);
    this.fontSize = parseFloat(cs.fontSize) || 12;
    this.fontFamily = cs.fontFamily || "monospace";
    this.font = `${this.fontSize}px ${this.fontFamily}`;
    const v = (name, fallback) => {
      const value = cs.getPropertyValue(name).trim();
      return value || fallback;
    };
    this.colorText = v("--de-grid-text", cs.color || "#ccc");
    this.colorMuted = v("--de-grid-muted", this.colorText);
    this.colorBorder = v("--de-grid-border", "rgba(128,128,128,0.3)");
    this.headerBg = v("--de-grid-header-bg", "rgba(128,128,128,0.15)");
    this.selectionFill = v("--de-grid-selection", "rgba(80,140,255,0.25)");
    this.flashFill = v("--de-grid-flash", "rgba(80,140,255,0.35)");
    // Tint applied to the index / header of rows / columns covered by the
    // current selection, so the selected row / column ids stand out.
    this.headerSelectionFill = v("--de-grid-header-selection", "rgba(80,140,255,0.15)");
  }

  // Measure row height, the index column, and every data column once, then size
  // the scroll sizer. Column widths are content-derived (we own layout here).
  computeLayout() {
    const p = this.props.payload;
    if (!p || !Array.isArray(p.rows) || !Array.isArray(p.columns) || !this.ctx) {
      return;
    }
    const { columns, rows, index } = p;
    this.ctx.font = this.font;
    this.rowHeight = Math.round(this.fontSize + 10);
    this.headerHeight = this.rowHeight;

    const sample = Math.min(rows.length, SAMPLE_ROWS);

    let iw = 0;
    for (let r = 0; r < sample; r++) {
      const t = index ? String(index[r]) : String(r);
      iw = Math.max(iw, this.ctx.measureText(t).width);
    }
    this.indexWidth = Math.ceil(iw) + PAD_X * 2;

    this.colWidths = columns.map((col, c) => {
      let w = this.ctx.measureText(String(col)).width;
      for (let r = 0; r < sample; r++) {
        const m = this.ctx.measureText(formatCell(rows[r][c])).width;
        if (m > w) {
          w = m;
        }
      }
      return Math.min(MAX_COL, Math.max(MIN_COL, Math.ceil(w) + PAD_X * 2));
    });

    this.colX = [];
    let x = this.indexWidth;
    for (const w of this.colWidths) {
      this.colX.push(x);
      x += w;
    }
    this.totalWidth = x;
    this.totalHeight = this.headerHeight + rows.length * this.rowHeight;

    if (this.sizerRef.current) {
      this.sizerRef.current.style.width = `${this.totalWidth}px`;
      this.sizerRef.current.style.height = `${this.totalHeight}px`;
    }
  }

  handleResize() {
    const wrap = this.wrapRef.current;
    const canvas = this.canvasRef.current;
    if (!wrap || !canvas) {
      return;
    }
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (w === 0 || h === 0) {
      return; // hidden (e.g. another view active); redraw when shown again.
    }
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    this.viewW = w;
    this.viewH = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    this.scheduleDraw();
  }

  handleScroll = () => this.scheduleDraw();

  scheduleDraw() {
    if (this._rafPending) {
      return;
    }
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this.draw();
    });
  }

  // Truncate text with an ellipsis to fit maxW (binary search, only for cells
  // that actually overflow). ctx.font is expected to be set by the caller.
  fitText(text, maxW) {
    const ctx = this.ctx;
    if (maxW <= 0) {
      return "";
    }
    if (ctx.measureText(text).width <= maxW) {
      return text;
    }
    const ell = "…";
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ctx.measureText(text.slice(0, mid) + ell).width <= maxW) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo > 0 ? text.slice(0, lo) + ell : ell;
  }

  draw() {
    const ctx = this.ctx;
    const wrap = this.wrapRef.current;
    const p = this.props.payload;
    if (!ctx || !wrap || !p || !Array.isArray(p.rows) || !this.viewW || !this.viewH) {
      return;
    }
    const { rows, columns, index } = p;
    const w = this.viewW;
    const h = this.viewH;
    const rh = this.rowHeight;
    const hh = this.headerHeight;
    const iw = this.indexWidth;
    const nRows = rows.length;
    const nCols = columns.length;
    const scrollLeft = wrap.scrollLeft;
    const scrollTop = wrap.scrollTop;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = this.font;
    ctx.textBaseline = "middle";

    const firstR = Math.max(0, Math.floor(scrollTop / rh));
    const lastR = Math.min(nRows - 1, Math.floor((scrollTop + (h - hh)) / rh));

    let firstC = 0;
    while (firstC < nCols && this.colX[firstC] + this.colWidths[firstC] - scrollLeft <= iw) {
      firstC++;
    }
    let lastC = firstC;
    while (lastC < nCols && this.colX[lastC] - scrollLeft < w) {
      lastC++;
    }
    lastC = Math.min(nCols - 1, lastC);

    // The selection highlight is only shown while the grid itself is focused;
    // when focus is elsewhere (e.g. the expression editor) it stays hidden.
    const selections = this.focused ? this.normSelections() : [];
    // Highlight the index / header of selected rows / columns. A pure column
    // selection (spans every row) shouldn't tint every row id, and a pure row
    // selection (spans every column) shouldn't tint every header, so each kind
    // only contributes to its own axis; cell / rectangle selections tint both.
    const isColSel = (s) => s.r0 === 0 && s.r1 === nRows - 1 && !(s.c0 === 0 && s.c1 === nCols - 1);
    const isRowSel = (s) => s.c0 === 0 && s.c1 === nCols - 1 && !(s.r0 === 0 && s.r1 === nRows - 1);
    const rowSelected = (r) => selections.some((s) => r >= s.r0 && r <= s.r1 && !isColSel(s));
    const colSelected = (c) => selections.some((s) => c >= s.c0 && c <= s.c1 && !isRowSel(s));
    const flashRow = this.props.selectedRow;

    // --- Body (clipped so nothing draws under the pinned header / index col) ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(iw, hh, w - iw, h - hh);
    ctx.clip();

    for (let r = firstR; r <= lastR; r++) {
      const y = hh + r * rh - scrollTop;
      if (flashRow === r) {
        ctx.fillStyle = this.flashFill;
        ctx.fillRect(iw, y, w - iw, rh);
      }
      for (let c = firstC; c <= lastC; c++) {
        const x = this.colX[c] - scrollLeft;
        const cw = this.colWidths[c];
        const selected = selections.some(
          (sel) => r >= sel.r0 && r <= sel.r1 && c >= sel.c0 && c <= sel.c1,
        );
        if (selected) {
          ctx.fillStyle = this.selectionFill;
          ctx.fillRect(x, y, cw, rh);
        }
        const text = formatCell(rows[r][c]);
        if (text) {
          ctx.fillStyle = this.colorText;
          ctx.fillText(this.fitText(text, cw - PAD_X * 2), x + PAD_X, y + rh / 2);
        }
      }
    }

    ctx.strokeStyle = this.colorBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = firstC; c <= lastC + 1 && c <= nCols; c++) {
      const cx = (c < nCols ? this.colX[c] : this.totalWidth) - scrollLeft;
      const gx = Math.round(cx) + 0.5;
      ctx.moveTo(gx, hh);
      ctx.lineTo(gx, h);
    }
    for (let r = firstR; r <= lastR + 1; r++) {
      const gy = Math.round(hh + r * rh - scrollTop) + 0.5;
      ctx.moveTo(iw, gy);
      ctx.lineTo(w, gy);
    }
    ctx.stroke();
    ctx.restore();

    // --- Pinned index column ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, hh, iw, h - hh);
    ctx.clip();
    ctx.fillStyle = this.headerBg;
    ctx.fillRect(0, hh, iw, h - hh);
    for (let r = firstR; r <= lastR; r++) {
      const y = hh + r * rh - scrollTop;
      if (flashRow === r) {
        ctx.fillStyle = this.flashFill;
        ctx.fillRect(0, y, iw, rh);
      } else if (rowSelected(r)) {
        ctx.fillStyle = this.headerSelectionFill;
        ctx.fillRect(0, y, iw, rh);
      }
      ctx.fillStyle = this.colorMuted;
      const t = String(index ? index[r] : r);
      ctx.fillText(this.fitText(t, iw - PAD_X * 2), PAD_X, y + rh / 2);
    }
    ctx.strokeStyle = this.colorBorder;
    ctx.beginPath();
    const ix = Math.round(iw) + 0.5;
    ctx.moveTo(ix, hh);
    ctx.lineTo(ix, h);
    for (let r = firstR; r <= lastR + 1; r++) {
      const gy = Math.round(hh + r * rh - scrollTop) + 0.5;
      ctx.moveTo(0, gy);
      ctx.lineTo(iw, gy);
    }
    ctx.stroke();
    ctx.restore();

    // --- Pinned header row ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(iw, 0, w - iw, hh);
    ctx.clip();
    ctx.fillStyle = this.headerBg;
    ctx.fillRect(iw, 0, w - iw, hh);
    for (let c = firstC; c <= lastC; c++) {
      if (colSelected(c)) {
        ctx.fillStyle = this.headerSelectionFill;
        ctx.fillRect(this.colX[c] - scrollLeft, 0, this.colWidths[c], hh);
      }
    }
    ctx.fillStyle = this.colorText;
    for (let c = firstC; c <= lastC; c++) {
      const x = this.colX[c] - scrollLeft;
      ctx.fillText(this.fitText(String(columns[c]), this.colWidths[c] - PAD_X * 2), x + PAD_X, hh / 2);
    }
    ctx.strokeStyle = this.colorBorder;
    ctx.beginPath();
    const hy = Math.round(hh) + 0.5;
    ctx.moveTo(0, hy);
    ctx.lineTo(w, hy);
    for (let c = firstC; c <= lastC + 1 && c <= nCols; c++) {
      const cx = (c < nCols ? this.colX[c] : this.totalWidth) - scrollLeft;
      const gx = Math.round(cx) + 0.5;
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, hh);
    }
    ctx.stroke();
    ctx.restore();

    // --- Corner ---
    ctx.fillStyle = this.headerBg;
    ctx.fillRect(0, 0, iw, hh);
    ctx.strokeStyle = this.colorBorder;
    ctx.beginPath();
    ctx.moveTo(Math.round(iw) + 0.5, 0);
    ctx.lineTo(Math.round(iw) + 0.5, hh);
    ctx.moveTo(0, Math.round(hh) + 0.5);
    ctx.lineTo(iw, Math.round(hh) + 0.5);
    ctx.stroke();
  }

  normSelections() {
    return this.selections
      .map((s) => ({
        r0: Math.min(s.r0, s.r1),
        r1: Math.max(s.r0, s.r1),
        c0: Math.min(s.c0, s.c1),
        c1: Math.max(s.c0, s.c1),
      }))
      .filter((s) => s.r0 <= s.r1 && s.c0 <= s.c1);
  }

  hasSelection() {
    return this.selections.length > 0;
  }

  gridSize() {
    const p = this.props.payload;
    return {
      nRows: p?.rows?.length || 0,
      nCols: p?.columns?.length || 0,
    };
  }

  clampCell(r, c) {
    const { nRows, nCols } = this.gridSize();
    return {
      r: Math.min(Math.max(r, 0), Math.max(nRows - 1, 0)),
      c: Math.min(Math.max(c, 0), Math.max(nCols - 1, 0)),
    };
  }

  activeCell() {
    if (!this.sel) {
      return { r: 0, c: 0 };
    }
    if (this.selMode === "row") {
      return this.clampCell(this.sel.r1, 0);
    }
    if (this.selMode === "col") {
      return this.clampCell(0, this.sel.c1);
    }
    if (this.selMode === "all") {
      return { r: 0, c: 0 };
    }
    return this.clampCell(this.sel.r1, this.sel.c1);
  }

  pageRowCount() {
    const bodyHeight = Math.max(0, (this.wrapRef.current?.clientHeight || 0) - this.headerHeight);
    return Math.max(1, Math.floor(bodyHeight / this.rowHeight) - 1);
  }

  runGridCommand(event, callback) {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    callback();
  }

  moveActiveSelection(deltaR, deltaC, extend = false) {
    const { nRows, nCols } = this.gridSize();
    if (nRows === 0 || nCols === 0) {
      return;
    }
    const active = this.activeCell();
    const target = this.clampCell(active.r + deltaR, active.c + deltaC);
    this.moveActiveSelectionTo(target.r, target.c, extend);
  }

  moveActiveSelectionTo(row, col, extend = false) {
    const { nRows, nCols } = this.gridSize();
    if (nRows === 0 || nCols === 0) {
      return;
    }
    const active = this.activeCell();
    const target = this.clampCell(row == null ? active.r : row, col == null ? active.c : col);
    const hit = { zone: "body", r: target.r, c: target.c };

    if (extend && this.sel) {
      this.extendTo(hit);
    } else {
      this.startSelection(hit);
    }
    this.scrollCellIntoView(target.r, target.c);
    this.scheduleDraw();
  }

  // Select the whole row / column at the given index (keyboard equivalent of
  // clicking the index column / header), mirroring the spreadsheet convention.
  selectRowAt(r) {
    const { nRows, nCols } = this.gridSize();
    if (nRows === 0 || nCols === 0) {
      return;
    }
    const { r: row } = this.clampCell(r, 0);
    this.startSelection({ zone: "row", r: row, c: 0 });
    this.scrollRowIntoView(row);
    this.scheduleDraw();
  }

  selectColumnAt(c) {
    const { nRows, nCols } = this.gridSize();
    if (nRows === 0 || nCols === 0) {
      return;
    }
    const { c: col } = this.clampCell(0, c);
    this.startSelection({ zone: "col", r: 0, c: col });
    this.scrollColumnIntoView(col);
    this.scheduleDraw();
  }

  // Select the entire grid (keyboard equivalent of clicking the corner). Used as
  // the "outermost" step when escalating out of a row / column selection.
  selectAll() {
    const { nRows, nCols } = this.gridSize();
    if (nRows === 0 || nCols === 0) {
      return;
    }
    this.startSelection({ zone: "corner", r: 0, c: 0 });
    this.scheduleDraw();
  }

  selectActiveRow() {
    this.selectRowAt(this.activeCell().r);
  }

  selectActiveColumn() {
    this.selectColumnAt(this.activeCell().c);
  }

  // Plain (non-extending) arrow navigation laid out like a spreadsheet's header
  // frame: the corner (select-all) sits at the top-left, the index column is the
  // left strip (rows), the header is the top strip (columns), and the body holds
  // the cells. Outward arrows widen the selection (cell -> row/column -> all) and
  // inward arrows step back in, so every transition is reversible:
  //   cell, c==0,  Left  -> select row        row,         Right -> enter cells
  //   cell, r==0,  Up    -> select column     column,      Down  -> enter cells
  //   row,  r==0,  Up    -> select all        all,         Down  -> first row
  //   column, c==0, Left -> select all        all,         Right -> first column
  navigate(deltaR, deltaC) {
    const { nRows, nCols } = this.gridSize();
    if (nRows === 0 || nCols === 0) {
      return;
    }
    if (!this.sel) {
      this.moveActiveSelection(deltaR, deltaC, false);
      return;
    }
    const active = this.activeCell();

    if (this.selMode === "all") {
      // Corner: step out into the first column / row. Inward arrows stay put.
      if (deltaC > 0) {
        this.selectColumnAt(0);
      } else if (deltaR > 0) {
        this.selectRowAt(0);
      }
      return;
    }

    if (this.selMode === "row") {
      if (deltaR !== 0) {
        if (deltaR < 0 && active.r === 0) {
          this.selectAll();
        } else {
          this.selectRowAt(active.r + deltaR);
        }
      } else if (deltaC > 0) {
        this.moveActiveSelectionTo(active.r, 0, false);
      }
      return;
    }

    if (this.selMode === "col") {
      if (deltaC !== 0) {
        if (deltaC < 0 && active.c === 0) {
          this.selectAll();
        } else {
          this.selectColumnAt(active.c + deltaC);
        }
      } else if (deltaR > 0) {
        this.moveActiveSelectionTo(0, active.c, false);
      }
      return;
    }

    if (deltaC < 0 && active.c === 0) {
      this.selectRowAt(active.r);
    } else if (deltaR < 0 && active.r === 0) {
      this.selectColumnAt(active.c);
    } else {
      this.moveActiveSelection(deltaR, deltaC, false);
    }
  }

  scrollRowIntoView(r) {
    const wrap = this.wrapRef.current;
    if (!wrap) {
      return;
    }
    const cellTop = r * this.rowHeight;
    const cellBottom = cellTop + this.rowHeight;
    const visibleRowHeight = wrap.clientHeight - this.headerHeight;
    if (cellTop < wrap.scrollTop) {
      wrap.scrollTop = cellTop;
    } else if (cellBottom > wrap.scrollTop + visibleRowHeight) {
      wrap.scrollTop = cellBottom - visibleRowHeight;
    }
  }

  scrollColumnIntoView(c) {
    const wrap = this.wrapRef.current;
    if (!wrap || !this.colX || !this.colWidths) {
      return;
    }
    const cellLeft = this.colX[c];
    const cellRight = cellLeft + this.colWidths[c];
    if (cellLeft - wrap.scrollLeft < this.indexWidth) {
      wrap.scrollLeft = Math.max(0, cellLeft - this.indexWidth);
    } else if (cellRight - wrap.scrollLeft > wrap.clientWidth) {
      wrap.scrollLeft = cellRight - wrap.clientWidth;
    }
  }

  // Scroll both axes so the cell is visible (used by cell navigation).
  scrollCellIntoView(r, c) {
    this.scrollRowIntoView(r);
    this.scrollColumnIntoView(c);
  }

  // Map a viewport point to a grid location: its zone (body / row header / column
  // header / corner) and the data row/column it resolves to (clamped to valid
  // ranges). Returns null only when outside the viewport and `clamp` is false.
  hit(clientX, clientY, clamp) {
    const wrap = this.wrapRef.current;
    const p = this.props.payload;
    const rect = wrap.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    if (!clamp && (px < 0 || py < 0 || px > this.viewW || py > this.viewH)) {
      return null;
    }
    const inIndex = px < this.indexWidth;
    const inHeader = py < this.headerHeight;
    const nRows = p.rows.length;
    const nCols = p.columns.length;

    let r = Math.floor((Math.max(py, this.headerHeight) - this.headerHeight + wrap.scrollTop) / this.rowHeight);
    r = Math.min(Math.max(r, 0), nRows - 1);

    const contentX = Math.max(px, this.indexWidth) + wrap.scrollLeft;
    let c = -1;
    for (let i = 0; i < this.colWidths.length; i++) {
      if (contentX >= this.colX[i] && contentX < this.colX[i] + this.colWidths[i]) {
        c = i;
        break;
      }
    }
    if (c < 0) {
      c = contentX < this.colX[0] ? 0 : nCols - 1;
    }

    let zone = "body";
    if (inIndex && inHeader) {
      zone = "corner";
    } else if (inIndex) {
      zone = "row";
    } else if (inHeader) {
      zone = "col";
    }
    return { zone, r, c };
  }

  // Begin a selection based on where the click landed: a body cell, a whole row
  // (index click), a whole column (header click), or everything (corner click).
  selectionFromHit(hit) {
    const nRows = this.props.payload.rows.length;
    const nCols = this.props.payload.columns.length;
    if (hit.zone === "corner") {
      return { mode: "all", sel: { r0: 0, c0: 0, r1: nRows - 1, c1: nCols - 1 } };
    } else if (hit.zone === "row") {
      return { mode: "row", sel: { r0: hit.r, c0: 0, r1: hit.r, c1: nCols - 1 } };
    } else if (hit.zone === "col") {
      return { mode: "col", sel: { r0: 0, c0: hit.c, r1: nRows - 1, c1: hit.c } };
    }
    return { mode: "cell", sel: { r0: hit.r, c0: hit.c, r1: hit.r, c1: hit.c } };
  }

  startSelection(hit, append = false) {
    const { mode, sel } = this.selectionFromHit(hit);
    this.selMode = mode;
    this.sel = sel;
    this.selections = append ? [...this.selections, sel] : [sel];
  }

  // Extend the active selection to `hit`, keeping the anchor (sel.r0/c0) and
  // honoring the current mode. Used by drag and shift-click.
  extendTo(hit) {
    if (!this.sel) {
      this.startSelection(hit);
      return;
    }
    const nRows = this.props.payload.rows.length;
    const nCols = this.props.payload.columns.length;
    if (this.selMode === "row") {
      this.sel.r1 = hit.r;
      this.sel.c0 = 0;
      this.sel.c1 = nCols - 1;
    } else if (this.selMode === "col") {
      this.sel.c1 = hit.c;
      this.sel.r0 = 0;
      this.sel.r1 = nRows - 1;
    } else if (this.selMode !== "all") {
      this.sel.r1 = hit.r;
      this.sel.c1 = hit.c;
    }
  }

  // Show the selection when the grid gains focus, seeding an active cell at the
  // top-left so the highlight is visible immediately (no arrow press needed).
  handleFocus = () => {
    this.focused = true;
    if (!this.hasSelection()) {
      const { nRows, nCols } = this.gridSize();
      if (nRows > 0 && nCols > 0) {
        this.startSelection({ zone: "body", r: 0, c: 0 });
      }
    }
    this.scheduleDraw();
  };

  handleBlur = () => {
    this.focused = false;
    this.scheduleDraw();
  };

  // True when the value on row `r` holds a nested structure we can drill into.
  isExpandable(r) {
    const meta = this.props.navMeta;
    return Boolean(meta && meta[r] && meta[r].expandable);
  }

  // Drill into the active row's value (Enter / double-click), handing up the
  // current position so it can be restored when stepping back.
  drillActiveRow() {
    const { r } = this.activeCell();
    if (this.isExpandable(r)) {
      this.props.onDrill?.(r, this.captureState());
    }
  }

  handleDoubleClick = (e) => {
    if (!this.props.onDrill) {
      return;
    }
    const hit = this.hit(e.clientX, e.clientY, false);
    if (hit && this.isExpandable(hit.r)) {
      this.props.onDrill(hit.r, this.captureState());
    }
  };

  // Snapshot / restore the selection and scroll offsets, so navigating back to a
  // level lands where the user left it.
  captureState() {
    const wrap = this.wrapRef.current;
    return {
      sel: this.sel ? { ...this.sel } : null,
      selections: this.selections.map((s) => ({ ...s })),
      selMode: this.selMode,
      scrollTop: wrap ? wrap.scrollTop : 0,
      scrollLeft: wrap ? wrap.scrollLeft : 0,
    };
  }

  restoreState(state) {
    if (!state) {
      return;
    }
    this.sel = state.sel ? { ...state.sel } : null;
    this.selections = (state.selections || []).map((s) => ({ ...s }));
    this.selMode = state.selMode;
    const wrap = this.wrapRef.current;
    if (wrap) {
      wrap.scrollTop = state.scrollTop || 0;
      wrap.scrollLeft = state.scrollLeft || 0;
    }
    this.scheduleDraw();
  }

  handleMouseDown = (e) => {
    if (e.button !== 0) {
      return;
    }
    // Interacting with the grid dismisses the plot-jump highlight.
    if (this.props.selectedRow != null) {
      this.props.onClearSelected?.();
    }
    this.wrapRef.current.focus({ preventScroll: true });
    const hit = this.hit(e.clientX, e.clientY, false);
    if (!hit) {
      this.sel = null;
      this.selections = [];
      this.scheduleDraw();
      return;
    }

    if (e.shiftKey && this.sel) {
      // Shift-click extends the current selection to the clicked location.
      this.extendTo(hit);
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd-click appends a new selection without clearing the existing ones.
      // Keep dragging active so Ctrl/Cmd-click-and-drag appends a range.
      this.startSelection(hit, this.hasSelection());
      this.dragging = true;
      window.addEventListener("mousemove", this.handleWindowMouseMove);
      window.addEventListener("mouseup", this.handleWindowMouseUp);
    } else {
      this.startSelection(hit);
      this.dragging = true;
      window.addEventListener("mousemove", this.handleWindowMouseMove);
      window.addEventListener("mouseup", this.handleWindowMouseUp);
    }
    this.scheduleDraw();
  };

  handleWindowMouseMove = (e) => {
    if (!this.dragging) {
      return;
    }
    const hit = this.hit(e.clientX, e.clientY, true);
    if (hit) {
      this.extendTo(hit);
      this.scheduleDraw();
    }
  };

  handleWindowMouseUp = () => {
    this.dragging = false;
    window.removeEventListener("mousemove", this.handleWindowMouseMove);
    window.removeEventListener("mouseup", this.handleWindowMouseUp);
  };

  handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C") && this.hasSelection()) {
      this.copySelection();
      e.preventDefault();
      // Stop Atom's document-level core:copy from running afterwards and
      // clobbering the clipboard with an (empty) editor copy.
      e.nativeEvent.stopImmediatePropagation();
    }
  };

  // Copy the selected ranges to the clipboard as TSV (pastes into spreadsheets).
  copySelection() {
    const selections = this.normSelections();
    if (selections.length === 0) {
      return;
    }
    const rows = this.props.payload.rows;
    const lines = [];
    for (const s of selections) {
      for (let r = s.r0; r <= s.r1; r++) {
        const cells = [];
        for (let c = s.c0; c <= s.c1; c++) {
          cells.push(formatCell(rows[r][c]));
        }
        lines.push(cells.join("\t"));
      }
    }
    atom.clipboard.write(lines.join("\n"));
  }

  scrollToSelected() {
    const sr = this.props.selectedRow;
    const wrap = this.wrapRef.current;
    if (sr == null || !wrap) {
      return;
    }
    const target =
      this.headerHeight + sr * this.rowHeight - (wrap.clientHeight - this.headerHeight) / 2 - this.rowHeight / 2;
    wrap.scrollTop = Math.max(0, target);
  }

  render() {
    return (
      <div
        ref={this.wrapRef}
        className="data-explorer-canvas-wrap"
        tabIndex={0}
        onScroll={this.handleScroll}
        onMouseDown={this.handleMouseDown}
        onDoubleClick={this.handleDoubleClick}
        onKeyDown={this.handleKeyDown}
        onFocus={this.handleFocus}
        onBlur={this.handleBlur}
      >
        <div ref={this.sizerRef} className="data-explorer-canvas-sizer" />
        <canvas ref={this.canvasRef} className="data-explorer-canvas" />
      </div>
    );
  }
}

const DataExplorerGrid = observer(({ des }) => {
  const payload = des.payload;
  if (!payload) {
    return null;
  }
  if (!Array.isArray(payload.rows) || !Array.isArray(payload.columns)) {
    return (
      <div className="data-explorer-scalar native-key-bindings" tabIndex={0}>
        <pre>{payload.repr || "No tabular representation"}</pre>
      </div>
    );
  }
  return (
    <CanvasGrid
      payload={payload}
      navMeta={payload.navmeta}
      onDrill={(r, state) => des.drillInto(r, state)}
      restoreState={des.pendingRestore}
      onRestored={() => des.clearPendingRestore()}
      selectedRow={des.selectedRow}
      onClearSelected={() => des.setSelectedRow(null)}
    />
  );
});

DataExplorerGrid.displayName = "DataExplorerGrid";
export default DataExplorerGrid;
