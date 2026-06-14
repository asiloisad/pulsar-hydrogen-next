/** @babel */
/** @jsx React.createElement */

import React from "react";
import { observer } from "mobx-react";
import { INDEX_COLUMN } from "../store/data-explorer-store";
import DataExplorerGrid from "./data-explorer-grid";

// View modes, inspired by the nteract data-explorer's view toolbar. "grid" and
// "summary" are tabular; the rest are Plotly charts.
const VIEWS = [
  { id: "grid", label: "Grid", icon: "icon-list-unordered" },
  { id: "line", label: "Line", icon: "icon-graph" },
  { id: "scatter", label: "Scatter", icon: "icon-primitive-dot" },
  { id: "heatmap", label: "Heatmap", icon: "icon-server" },
];

// Per-view control spec. `x`/`y`/`z` are single-select axes (z optional -> 3D),
// `color` is a categorical group-by, `metrics` is a multi-select used only by
// parallel coordinates. Labels override the default control titles.
const VIEW_SPEC = {
  scatter: { x: true, y: true, z: true, color: true },
  line: { x: true, y: true, z: true, color: true },
  bar: { x: true, y: true, color: true },
  area: { x: true, y: true, color: true },
  histogram: { y: true, color: true, yLabel: "Value" },
  box: { x: true, xOptional: true, xLabel: "Group", y: true, yLabel: "Value", color: true },
  heatmap: { x: true, y: true },
  parallel: { metrics: true },
};

/**
 * In-flow message used inside the body (below the controls). Unlike
 * `background-tips`/`.centered`, this does not absolutely position itself, so it
 * never overlaps the header controls.
 */
function Message({ children }) {
  return <div className="data-explorer-message">{children}</div>;
}

function formatCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return String(value);
}

// Small footer note shown when the kernel capped the number of fetched rows.
const GridFooter = observer(({ des }) => {
  const payload = des.payload;
  if (!payload || !payload.truncated) {
    return null;
  }
  return (
    <div className="data-explorer-pager">
      <span className="output-truncated">
        showing first {payload.rows.length} of {payload.total_rows} rows
      </span>
    </div>
  );
});

function toNum(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// Coerce an axis range bound to a number (date strings -> ms) so a range can be
// scaled around its center.
function toMs(v) {
  if (typeof v === "number") {
    return v;
  }
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? Number(v) : t;
}

function colValues(payload, col) {
  if (col === INDEX_COLUMN) {
    return payload.index || [];
  }
  const i = payload.columns.indexOf(col);
  return payload.rows.map((row) => row[i]);
}

// Values for a numeric value-axis: coerce so numeric-as-text columns (common in
// object-dtype DataFrame columns) still plot; non-numeric cells become gaps.
function numValues(payload, col) {
  return colValues(payload, col).map(toNum);
}

// True when the array has finite numbers spanning a non-zero range, i.e. it can
// be binned. histogram2d produces NaN image dimensions otherwise.
function hasNumericRange(arr) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of arr) {
    if (v !== null && Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return max > min;
}

function pick(arr, indices) {
  return indices.map((i) => arr[i]);
}

// Original row index for each row, attached to traces as customdata so a clicked
// point can be mapped back to its grid row.
function rowIndices(payload) {
  return payload.rows.map((_, i) => i);
}

// Group row indices by the (stringified) value of a categorical column.
function groupByColor(payload, colorCol) {
  const vals = colValues(payload, colorCol);
  const groups = new Map();
  vals.forEach((v, i) => {
    const key = v === null || v === undefined ? "(null)" : String(v);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(i);
  });
  return [...groups.entries()].map(([key, indices]) => ({ key, indices }));
}

const BASE_LAYOUT = {
  autosize: true,
  margin: { l: 50, r: 20, t: 30, b: 40 },
  showlegend: false,
  font: { color: "#9da5b4" },
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  xaxis: {},
  yaxis: {},
};

// Is this a 3D plot? Only scatter / line with a Z axis selected.
function is3D(view, zColumn) {
  return (view === "scatter" || view === "line") && Boolean(zColumn);
}

function axisTitle(col) {
  return col === INDEX_COLUMN ? "index" : col;
}

function buildFigure(payload, view, axes) {
  const { x, y, z, color, metrics } = axes;
  const numeric = payload.numeric_columns || [];

  if (view === "heatmap") {
    // 2D density of the two selected columns. Bail out on degenerate data
    // (no finite values or zero range) which would make Plotly compute NaN bins.
    const xs = numValues(payload, x);
    const ys = numValues(payload, y);
    if (!hasNumericRange(xs) || !hasNumericRange(ys)) {
      return null;
    }
    return {
      data: [{ type: "histogram2d", x: xs, y: ys, colorscale: "YlOrRd" }],
      layout: {
        ...BASE_LAYOUT,
        showlegend: false,
        xaxis: { title: axisTitle(x) },
        yaxis: { title: axisTitle(y) },
      },
    };
  }

  if (view === "parallel") {
    const dimensions = metrics.map((c) => ({
      label: c,
      values: colValues(payload, c).map(toNum),
    }));
    return {
      data: [{ type: "parcoords", dimensions }],
      layout: { ...BASE_LAYOUT, showlegend: false },
    };
  }

  if (view === "histogram") {
    const data = [];
    const yv = numValues(payload, y);
    if (color) {
      for (const g of groupByColor(payload, color)) {
        data.push({ type: "histogram", x: pick(yv, g.indices), name: g.key, opacity: 0.7 });
      }
    } else {
      data.push({ type: "histogram", x: yv });
    }
    return {
      data,
      layout: { ...BASE_LAYOUT, barmode: "overlay", xaxis: { title: axisTitle(y) } },
    };
  }

  if (view === "box") {
    const yv = numValues(payload, y);
    const groupX = x && x !== INDEX_COLUMN ? colValues(payload, x).map(String) : null;
    const data = [];
    if (color) {
      for (const g of groupByColor(payload, color)) {
        data.push({
          type: "box",
          y: pick(yv, g.indices),
          x: groupX ? pick(groupX, g.indices) : undefined,
          name: g.key,
        });
      }
    } else {
      data.push({ type: "box", y: yv, x: groupX || undefined, name: axisTitle(y) });
    }
    return { data, layout: { ...BASE_LAYOUT, boxmode: "group" } };
  }

  // scatter / line / bar / area. Y is always a numeric value axis; X stays raw
  // in 2D so categorical / datetime axes work, but is numeric in 3D space.
  const yVals = numValues(payload, y);

  if (is3D(view, z)) {
    const xVals = numValues(payload, x);
    const zVals = numValues(payload, z);
    const base = {
      type: "scatter3d",
      mode: view === "line" ? "lines" : "markers",
      marker: { size: 3 },
    };
    const data = [];
    if (color) {
      for (const g of groupByColor(payload, color)) {
        data.push({
          ...base,
          x: pick(xVals, g.indices),
          y: pick(yVals, g.indices),
          z: pick(zVals, g.indices),
          customdata: g.indices,
          name: g.key,
        });
      }
    } else {
      data.push({ ...base, x: xVals, y: yVals, z: zVals, customdata: rowIndices(payload) });
    }
    return {
      data,
      layout: {
        ...BASE_LAYOUT,
        scene: {
          dragmode: "turntable",
          xaxis: { title: axisTitle(x) },
          yaxis: { title: axisTitle(y) },
          zaxis: { title: axisTitle(z) },
        },
      },
    };
  }

  const xVals = colValues(payload, x);
  const base = {
    line: { type: "scatter", mode: "lines" },
    scatter: { type: "scatter", mode: "markers" },
    bar: { type: "bar" },
    area: { type: "scatter", mode: "lines", stackgroup: "one" },
  }[view];

  const data = [];
  if (color) {
    for (const g of groupByColor(payload, color)) {
      data.push({
        ...base,
        x: pick(xVals, g.indices),
        y: pick(yVals, g.indices),
        customdata: g.indices,
        name: g.key,
      });
    }
  } else {
    data.push({ ...base, x: xVals, y: yVals, customdata: rowIndices(payload), name: axisTitle(y) });
  }

  const extra = view === "bar" ? { barmode: "group" } : {};
  return {
    data,
    layout: {
      ...BASE_LAYOUT,
      ...extra,
      xaxis: { title: axisTitle(x) },
      yaxis: { title: axisTitle(y) },
    },
  };
}

/**
 * Plotly chart that fills its container and resizes with it. Unlike the shared
 * PlotlyTransform (used by inline outputs with a fixed min-height), this is meant
 * to occupy the full Data Explorer panel, so it sets width/height 100% and uses a
 * ResizeObserver to keep the plot sized to the pane.
 */
class ResponsivePlot extends React.Component {
  containerRef = React.createRef();

  // Plotly uses the right mouse button to orbit 3D plots, so the browser context
  // menu must be suppressed. A native capture-phase listener is used because
  // Plotly's inner DOM (incl. the WebGL canvas) doesn't reliably reach React's
  // delegated onContextMenu handler.
  preventContextMenu = (e) => {
    e.preventDefault();
    // Stop propagation so Atom's document-level context-menu manager doesn't show
    // its menu either (preventDefault only blocks the native browser menu).
    e.stopPropagation();
    e.stopImmediatePropagation();
  };

  // Stretch (+, factor < 1) or compress (−, factor > 1) one axis by scaling its
  // range around its center.
  stretchAxis = (axisKey, factor) => {
    const gd = this.containerRef.current;
    if (!gd || !gd._fullLayout || !this.Plotly) {
      return;
    }
    const layout = this.props.is3D ? gd._fullLayout.scene : gd._fullLayout;
    const axis = layout && layout[axisKey];
    if (!axis || !axis.range) {
      return;
    }
    const a = toMs(axis.range[0]);
    const b = toMs(axis.range[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return;
    }
    const center = (a + b) / 2;
    const half = ((b - a) / 2) * factor;
    const path = this.props.is3D ? `scene.${axisKey}.range` : `${axisKey}.range`;
    this.Plotly.relayout(gd, { [path]: [center - half, center + half] });
  };

  downloadImage = (gd) => {
    this.Plotly.toImage(gd).then((dataUrl) => {
      const remote = require(
        require("path").join(
          atom.getLoadSettings().resourcePath,
          "node_modules",
          "@electron/remote",
        ),
      );
      remote.getCurrentWebContents().downloadURL(dataUrl);
    });
  };

  // Draw only once the container has a real size. Plotly throws (e.g.
  // createImageData with zero width) if it renders into a 0-sized element, which
  // happens when the pane/plot is laid out but not yet visible.
  tryDraw() {
    const gd = this.containerRef.current;
    if (!gd || !this.Plotly || gd.clientWidth === 0 || gd.clientHeight === 0) {
      return;
    }
    if (this._drawn) {
      this.draw("react");
    } else {
      this.draw("newPlot");
      this._drawn = true;
      gd.on("plotly_click", this.handlePlotClick);
    }
  }

  draw(method) {
    const { data, layout } = this.props.figure;
    this.Plotly[method](this.containerRef.current, data, layout, {
      responsive: true,
      displaylogo: false,
      scrollZoom: true,
      modeBarButtonsToRemove: ["toImage"],
      modeBarButtonsToAdd: [
        {
          name: "Download plot as a png",
          icon: this.Plotly.Icons.camera,
          click: this.downloadImage,
        },
      ],
    });
  }

  // Right-drag pans 2D plots (matching the right-button move on 3D, which Plotly
  // handles natively). Converts pixel movement to axis-range shifts.
  handleMouseDown = (e) => {
    if (e.button !== 2 || this.props.is3D) {
      return;
    }
    const fl = this.containerRef.current && this.containerRef.current._fullLayout;
    if (!fl || !fl.xaxis || !fl.yaxis || !fl.xaxis.range || !fl.yaxis.range) {
      return;
    }
    this._pan = {
      startX: e.clientX,
      startY: e.clientY,
      xRange: fl.xaxis.range.map(toMs),
      yRange: fl.yaxis.range.map(toMs),
      xLen: fl.xaxis._length,
      yLen: fl.yaxis._length,
    };
    // Stop Plotly's own drag layer from seeing this (otherwise it box-zooms on
    // release). Capture phase + stopPropagation keeps it from starting a drag.
    e.preventDefault();
    e.stopPropagation();
    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("mouseup", this.handleMouseUp);
  };

  handleMouseMove = (e) => {
    const p = this._pan;
    const gd = this.containerRef.current;
    if (!p || !gd || !this.Plotly) {
      return;
    }
    const dx = ((e.clientX - p.startX) / p.xLen) * (p.xRange[1] - p.xRange[0]);
    const dy = ((e.clientY - p.startY) / p.yLen) * (p.yRange[1] - p.yRange[0]);
    this.Plotly.relayout(gd, {
      "xaxis.range": [p.xRange[0] - dx, p.xRange[1] - dx],
      "yaxis.range": [p.yRange[0] + dy, p.yRange[1] + dy],
    });
  };

  handleMouseUp = () => {
    this._pan = null;
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);
  };

  // Escape clears any active box/lasso selection (un-dims all points).
  handleKeyDown = (e) => {
    if (e.key !== "Escape") {
      return;
    }
    const gd = this.containerRef.current;
    if (gd && this.Plotly) {
      this.Plotly.restyle(gd, { selectedpoints: [null] });
    }
  };

  // A clicked point carries its original row index in customdata; report it so
  // the grid can jump to that row.
  handlePlotClick = (event) => {
    const point = event && event.points && event.points[0];
    if (!point || point.customdata == null) {
      return;
    }
    if (this.props.onPointClick) {
      this.props.onPointClick(point.customdata);
    }
  };

  componentDidMount() {
    this.Plotly = require("plotly.js-dist");
    this.containerRef.current.addEventListener("contextmenu", this.preventContextMenu, true);
    this.containerRef.current.addEventListener("mousedown", this.handleMouseDown, true);
    document.addEventListener("keydown", this.handleKeyDown);
    this.resizeObserver = new ResizeObserver(() => {
      const gd = this.containerRef.current;
      if (!gd) {
        return;
      }
      // Draw lazily once the container has a real size, then just resize.
      if (!this._drawn) {
        this.tryDraw();
      } else if (gd.clientWidth > 0 && gd.clientHeight > 0) {
        this.Plotly.Plots.resize(gd);
      }
    });
    this.resizeObserver.observe(this.containerRef.current);
    this.tryDraw();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.figure !== this.props.figure) {
      this.tryDraw();
    }
  }

  componentWillUnmount() {
    document.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.containerRef.current) {
      this.containerRef.current.removeEventListener("contextmenu", this.preventContextMenu, true);
      this.containerRef.current.removeEventListener("mousedown", this.handleMouseDown, true);
    }
    if (this._drawn && this.Plotly && this.containerRef.current) {
      this.Plotly.purge(this.containerRef.current);
    }
  }

  render() {
    return <div ref={this.containerRef} className="data-explorer-plotly" />;
  }
}

// Catches render/draw failures from the plot (e.g. Plotly throwing on a
// degenerate figure) so the whole panel doesn't crash. Resets when `resetKey`
// changes, so picking different axes / view retries.
class PlotErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return <Message>Could not render this plot. Try different axes or another view.</Message>;
    }
    return this.props.children;
  }
}

// Single-select axis dropdown. `optional` adds a "(none)" entry. When `axisKey`
// + `onStretch` are given, the label also carries −/+ buttons that stretch /
// compress that plot axis.
function AxisSelect({ label, value, options, optional, onChange, axisKey, onStretch }) {
  return (
    <div className="data-explorer-control">
      <span className="data-explorer-control-label">{label}</span>
      <div className="data-explorer-axis-group">
        {onStretch ? (
          <React.Fragment>
            <button
              type="button"
              className="btn"
              title={`Compress ${label} axis`}
              onClick={() => onStretch(axisKey, 1.25)}
            >
              −
            </button>
            <button
              type="button"
              className="btn"
              title={`Stretch ${label} axis`}
              onClick={() => onStretch(axisKey, 0.8)}
            >
              +
            </button>
          </React.Fragment>
        ) : null}
        <select className="input-select" value={value || ""} onChange={(e) => onChange(e.target.value)}>
          {optional ? <option value="">(none)</option> : null}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const ChartControls = observer(({ des, view, onStretch }) => {
  const payload = des.payload;
  const spec = VIEW_SPEC[view] || {};
  const numeric = payload.numeric_columns || [];
  const categorical = payload.columns.filter((c) => !numeric.includes(c));

  const columnOptions = payload.columns.map((c) => ({ value: c, label: c }));
  const allOptions = [{ value: INDEX_COLUMN, label: "(index)" }, ...columnOptions];
  const categoricalOptions = categorical.map((c) => ({ value: c, label: c }));

  return (
    <div className="data-explorer-plot-controls">
      {spec.x ? (
        <AxisSelect
          label={spec.xLabel || "X"}
          value={des.xColumn}
          options={allOptions}
          optional={spec.xOptional}
          onChange={des.setXColumn}
          axisKey="xaxis"
          onStretch={onStretch}
        />
      ) : null}

      {spec.y ? (
        <AxisSelect
          label={spec.yLabel || "Y"}
          value={des.yColumn}
          options={columnOptions}
          onChange={des.setYColumn}
          axisKey="yaxis"
          onStretch={onStretch}
        />
      ) : null}

      {spec.z ? (
        <AxisSelect
          label="Z"
          value={des.zColumn}
          options={columnOptions}
          optional
          onChange={des.setZColumn}
          axisKey="zaxis"
          onStretch={onStretch}
        />
      ) : null}

      {spec.color && categorical.length > 0 ? (
        <AxisSelect
          label="Color"
          value={des.colorColumn}
          options={categoricalOptions}
          optional
          onChange={des.setColorColumn}
        />
      ) : null}

      {spec.metrics ? (
        <div className="data-explorer-control data-explorer-ycols">
          <span>Dimensions</span>
          <div className="data-explorer-ycol-list">
            {numeric.map((col) => (
              <label key={col} className="input-label">
                <input
                  className="input-checkbox"
                  type="checkbox"
                  checked={des.yColumns.includes(col)}
                  onChange={() => des.toggleYColumn(col)}
                />
                <span>{col}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
});

// The plot body only; axis controls live in the header (ChartControls).
const ChartPlot = observer(({ des, view, plotRef, onPointClick }) => {
  const payload = des.payload;
  if (!payload || !Array.isArray(payload.columns) || payload.columns.length === 0) {
    return <Message>No columns available to plot</Message>;
  }

  const spec = VIEW_SPEC[view] || {};
  const numeric = payload.numeric_columns || [];
  // Parallel coordinates can only use the auto-detected numeric columns.
  if (view === "parallel" && numeric.length === 0) {
    return <Message>No numeric columns available for this view</Message>;
  }

  const axes = {
    x: des.xColumn,
    y: des.yColumn,
    z: des.zColumn,
    color: des.colorColumn,
    metrics: des.yColumns,
  };

  // Readiness: views that need a Y axis require it; parallel needs >=1 metric.
  const ready = spec.metrics ? des.yColumns.length > 0 : !spec.y || Boolean(des.yColumn);
  const figure = ready ? buildFigure(payload, view, axes) : null;

  // Remount Plotly when the chart type or its dimensionality changes so 2D<->3D
  // switches do a clean newPlot instead of a redraw with stale axes.
  const threeD = is3D(view, des.zColumn);
  const plotKey = `${view}-${threeD ? "3d" : "2d"}`;

  const resetKey = `${plotKey}|${des.xColumn}|${des.yColumn}|${des.colorColumn}|${des.yColumns.join(",")}`;

  return (
    <div className="data-explorer-plot">
      <div className="data-explorer-plot-area">
        {figure ? (
          <PlotErrorBoundary resetKey={resetKey}>
            <ResponsivePlot
              ref={plotRef}
              key={plotKey}
              figure={figure}
              is3D={threeD}
              onPointClick={onPointClick}
            />
          </PlotErrorBoundary>
        ) : ready ? (
          <Message>Not enough numeric data to plot the selected axes</Message>
        ) : (
          <Message>Select the axes to plot</Message>
        )}
      </div>
    </div>
  );
});

const SummaryView = observer(({ des }) => {
  const summary = des.payload && des.payload.summary;
  if (!summary || !Array.isArray(summary.rows)) {
    return <Message>No summary statistics available for this data</Message>;
  }
  return (
    <div className="data-explorer-table-wrapper native-key-bindings">
      <table className="data-explorer-table">
        <thead>
          <tr>
            <th className="data-explorer-index-head"></th>
            {summary.stats.map((s, i) => (
              <th key={i}>{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((row, r) => (
            <tr key={r}>
              <td className="data-explorer-index-cell">{summary.index[r]}</td>
              {row.map((cell, c) => (
                <td key={c}>{formatCell(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

const ViewToolbar = observer(({ des }) => (
  <div className="btn-group data-explorer-view-toggle">
    {VIEWS.map((v) => (
      <button
        key={v.id}
        className={`btn icon ${v.icon} ${des.viewMode === v.id ? "selected" : ""}`}
        onClick={() => des.setViewMode(v.id)}
      >
        {v.label}
      </button>
    ))}
  </div>
));

/**
 * Multi-line expression editor, built the same way as the watch editor
 * (atom.workspace.buildTextEditor + assignLanguageMode, no textEditors.add which
 * would reset the grammar to plain text). Live edits update the stored
 * expression; Enter confirms / loads, Shift+Enter inserts a newline (keymaps).
 */
class ExpressionEditor extends React.Component {
  containerRef = React.createRef();

  componentDidMount() {
    this.editor = atom.workspace.buildTextEditor({
      softWrapped: true,
      lineNumberGutterVisible: false,
      placeholderText: "Expression to load (e.g. df)",
    });
    this.editor.element.classList.add("data-explorer-expression");
    if (this.props.grammar) {
      atom.grammars.assignLanguageMode(this.editor.getBuffer(), this.props.grammar.scopeName);
    }
    if (this.props.value) {
      this.editor.setText(this.props.value);
    }
    this.containerRef.current.appendChild(this.editor.element);
    this._changeDisposable = this.editor.onDidChange(() => {
      this.props.onChange(this.editor.getText());
    });
    this._commands = atom.commands.add(this.editor.element, {
      "core:confirm": () => this.props.onConfirm(this.editor.getText()),
    });
  }

  componentDidUpdate() {
    if (this.editor && this.editor.getText() !== this.props.value) {
      this.editor.setText(this.props.value || "");
    }
  }

  componentWillUnmount() {
    this._changeDisposable?.dispose();
    this._commands?.dispose();
    this.editor?.destroy();
  }

  render() {
    return <div className="data-explorer-expression-editor" ref={this.containerRef} />;
  }
}

@observer
class DataExplorer extends React.Component {
  plotRef = React.createRef();

  handleRefresh = () => {
    this.props.des.refresh();
  };

  handleStretch = (axisKey, factor) => {
    if (this.plotRef.current) {
      this.plotRef.current.stretchAxis(axisKey, factor);
    }
  };

  handlePointClick = (rowIndex) => {
    const des = this.props.des;
    des.setSelectedRow(rowIndex);
    des.setViewMode("grid");
  };

  render() {
    // Singleton store, fed explicitly via the data-explorer command / Variable
    // Explorer. It is intentionally decoupled from store.kernel so switching the
    // focused editor never re-renders or reloads the panel.
    const des = this.props.des;
    const view = des.viewMode;
    const isChart = view !== "grid" && view !== "summary";
    const hasTable = des.payload && Array.isArray(des.payload.columns);

    return (
      <div className="data-explorer">
        <div className="data-explorer-controls">
          <div className="data-explorer-expression">
            <ExpressionEditor
              value={des.expression}
              onChange={des.setExpression}
              onConfirm={des.loadExpression}
              grammar={des.kernel && des.kernel.grammar}
            />
          </div>
          <div className="data-explorer-toolbar-row">
            <ViewToolbar des={des} />
            {isChart && hasTable ? (
              <ChartControls des={des} view={view} onStretch={this.handleStretch} />
            ) : null}
            <button
              className="btn icon icon-repo-sync data-explorer-reload"
              onClick={this.handleRefresh}
              disabled={!des.expression}
              title="Reload expression"
            />
          </div>
        </div>

        <div className="data-explorer-body">
          {des.loading ? (
            <Message>Loading...</Message>
          ) : des.error ? (
            <Message>
              <span className="text-error">{des.error}</span>
            </Message>
          ) : !des.payload ? (
            <Message>
              <div>No data loaded.</div>
              <div className="text-subtle">
                Put the cursor on a variable (or select an expression) and run
                "Data Explorer", or use the Variable Explorer.
              </div>
            </Message>
          ) : (
            <React.Fragment>
              {/* Grid stays mounted and is just hidden when another view is
                  active, so switching back doesn't rebuild the whole table. */}
              <div
                className={`data-explorer-grid-view${view === "grid" ? "" : " is-hidden"}`}
              >
                <DataExplorerGrid des={des} />
                <GridFooter des={des} />
              </div>
              {view === "summary" ? <SummaryView des={des} /> : null}
              {isChart ? (
                <ChartPlot
                  des={des}
                  view={view}
                  plotRef={this.plotRef}
                  onPointClick={this.handlePointClick}
                />
              ) : null}
            </React.Fragment>
          )}
        </div>
      </div>
    );
  }
}

DataExplorer.displayName = "DataExplorer";
export default DataExplorer;
