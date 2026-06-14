/** @babel */

import { action, observable, computed, makeObservable } from "mobx";

const INDEX_COLUMN = "__index__";

/**
 * Build the Python code that serializes the given expression into a JSON
 * envelope on stdout. Mirrors the executeWatch + JSON.parse pattern used by the
 * Variable Explorer. The helper inspects the object, caps the number of rows /
 * columns, and coerces every cell to a JSON-safe scalar.
 */
function buildSerializerCode(expression) {
  const exprLiteral = JSON.stringify(expression);
  return `
def _hydrogen_data_explorer():
    import json, math
    MAX_ROWS = 1000
    MAX_COLS = 100

    def _clean(v):
        try:
            import numpy as _np
            if isinstance(v, _np.generic):
                v = v.item()
        except Exception:
            pass
        if isinstance(v, bool):
            return v
        if isinstance(v, float):
            if math.isnan(v) or math.isinf(v):
                return None
            return v
        if v is None or isinstance(v, (int, str)):
            return v
        return str(v)

    # Run the input like a notebook cell: execute all statements, then take the
    # value of the trailing expression. Runs in a copy of globals so temporaries
    # (e.g. a = 1) don't leak into the user namespace.
    _src = ${exprLiteral}
    try:
        import ast
        _tree = ast.parse(_src)
        _ns = dict(globals())
        if _tree.body and isinstance(_tree.body[-1], ast.Expr):
            _last = ast.Expression(_tree.body.pop().value)
            exec(compile(_tree, "<data-explorer>", "exec"), _ns)
            _obj = eval(compile(_last, "<data-explorer>", "eval"), _ns)
        else:
            exec(compile(_tree, "<data-explorer>", "exec"), _ns)
            _obj = None
    except Exception as e:
        return {"kind": "error", "message": "Failed to evaluate: %s" % e}

    result = {"name": ${exprLiteral}}
    try:
        # Match by class hierarchy (MRO) so subclasses of DataFrame / Series /
        # ndarray are detected, not just the exact pandas / numpy classes.
        def _is(obj, name):
            return any(getattr(b, "__name__", "") == name for b in type(obj).__mro__)

        if _is(_obj, "DataFrame"):
            total_rows = int(_obj.shape[0])
            cols = list(_obj.columns)[:MAX_COLS]
            sub = _obj.iloc[:MAX_ROWS][cols]
            numeric = list(_obj.select_dtypes(include="number").columns)
            result.update({
                "kind": "dataframe",
                "shape": [int(_obj.shape[0]), int(_obj.shape[1])],
                "columns": [str(c) for c in cols],
                "dtypes": {str(c): str(_obj.dtypes[c]) for c in cols},
                "index": [str(i) for i in sub.index.tolist()],
                "rows": [[_clean(v) for v in row]
                         for row in sub.itertuples(index=False, name=None)],
                "total_rows": total_rows,
                "truncated": total_rows > MAX_ROWS,
                "numeric_columns": [str(c) for c in numeric if c in cols],
            })
            try:
                desc = _obj.describe().T
                result["summary"] = {
                    "stats": [str(s) for s in desc.columns],
                    "index": [str(i) for i in desc.index],
                    "rows": [[_clean(v) for v in row]
                             for row in desc.itertuples(index=False, name=None)],
                }
            except Exception:
                pass
        elif _is(_obj, "Series"):
            total = int(len(_obj))
            sub = _obj.iloc[:MAX_ROWS]
            name = str(_obj.name) if _obj.name is not None else "value"
            is_num = str(_obj.dtype) != "object" and str(_obj.dtype) != "bool"
            result.update({
                "kind": "series",
                "shape": [total],
                "columns": [name],
                "dtypes": {name: str(_obj.dtype)},
                "index": [str(i) for i in sub.index.tolist()],
                "rows": [[_clean(v)] for v in sub.tolist()],
                "total_rows": total,
                "truncated": total > MAX_ROWS,
                "numeric_columns": [name] if is_num else [],
            })
            try:
                desc = _obj.describe()
                result["summary"] = {
                    "stats": [str(i) for i in desc.index],
                    "index": [name],
                    "rows": [[_clean(v) for v in desc.tolist()]],
                }
            except Exception:
                pass
        elif _is(_obj, "ndarray"):
            import numpy as np
            shape = [int(s) for s in _obj.shape]
            dtype = str(_obj.dtype)
            is_num = np.issubdtype(_obj.dtype, np.number)
            if _obj.ndim <= 1:
                n = int(shape[0]) if shape else 0
                arr = _obj[:MAX_ROWS]
                result.update({
                    "kind": "ndarray", "shape": shape, "dtype": dtype,
                    "columns": ["value"],
                    "index": [str(i) for i in range(min(n, MAX_ROWS))],
                    "rows": [[_clean(v)] for v in arr.tolist()],
                    "total_rows": n, "truncated": n > MAX_ROWS,
                    "numeric_columns": ["value"] if is_num else [],
                })
            elif _obj.ndim == 2:
                ncols = min(int(_obj.shape[1]), MAX_COLS)
                arr = _obj[:MAX_ROWS, :ncols]
                cols = ["col%d" % i for i in range(ncols)]
                result.update({
                    "kind": "ndarray", "shape": shape, "dtype": dtype,
                    "columns": cols,
                    "index": [str(i) for i in range(min(int(_obj.shape[0]), MAX_ROWS))],
                    "rows": [[_clean(v) for v in row] for row in arr.tolist()],
                    "total_rows": int(_obj.shape[0]),
                    "truncated": int(_obj.shape[0]) > MAX_ROWS,
                    "numeric_columns": cols if is_num else [],
                })
            else:
                result.update({
                    "kind": "scalar", "shape": shape, "dtype": dtype,
                    "repr": "ndarray(shape=%s, dtype=%s)\\n%s" % (shape, dtype, repr(_obj)[:2000]),
                })
        elif isinstance(_obj, (list, tuple)):
            total = len(_obj)
            seq = list(_obj)[:MAX_ROWS]
            if seq and all(isinstance(x, dict) for x in seq):
                colset = []
                for d in seq:
                    for k in d.keys():
                        if k not in colset and len(colset) < MAX_COLS:
                            colset.append(k)
                rows = [[_clean(d.get(c)) for c in colset] for d in seq]
                result.update({
                    "kind": "list", "columns": [str(c) for c in colset],
                    "index": [str(i) for i in range(len(seq))],
                    "rows": rows, "total_rows": total, "truncated": total > MAX_ROWS,
                    "numeric_columns": [],
                })
            elif seq and all(isinstance(x, (list, tuple)) for x in seq):
                ncols = min(max(len(x) for x in seq), MAX_COLS)
                cols = ["col%d" % i for i in range(ncols)]
                rows = [[_clean(x[i]) if i < len(x) else None for i in range(ncols)] for x in seq]
                result.update({
                    "kind": "list", "columns": cols,
                    "index": [str(i) for i in range(len(seq))],
                    "rows": rows, "total_rows": total, "truncated": total > MAX_ROWS,
                    "numeric_columns": cols,
                })
            else:
                allnum = all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in seq)
                result.update({
                    "kind": "list", "columns": ["value"],
                    "index": [str(i) for i in range(len(seq))],
                    "rows": [[_clean(x)] for x in seq],
                    "total_rows": total, "truncated": total > MAX_ROWS,
                    "numeric_columns": ["value"] if allnum else [],
                })
        elif isinstance(_obj, dict):
            total = len(_obj)
            items = list(_obj.items())[:MAX_ROWS]
            result.update({
                "kind": "dict", "columns": ["key", "value"],
                "index": [str(i) for i in range(len(items))],
                "rows": [[_clean(k), _clean(v)] for k, v in items],
                "total_rows": total, "truncated": total > MAX_ROWS,
                "numeric_columns": [],
            })
        else:
            result.update({"kind": "scalar", "repr": repr(_obj)[:2000]})
    except Exception as e:
        return {"kind": "error", "message": str(e)}
    return result

print(__import__("json").dumps(_hydrogen_data_explorer(), default=str))
del _hydrogen_data_explorer
`;
}

export { INDEX_COLUMN, buildSerializerCode };

/**
 * Singleton store backing the Data Explorer. It is fed explicitly with a kernel
 * and an expression (from the `data-explorer` command or the Variable Explorer),
 * and holds onto that data independently of the workspace focus / store.kernel.
 * This keeps the panel stable (and cheap) when the user switches editors.
 */
export class DataExplorerStore {
  kernel = null; // the kernel feeding the explorer (set on load)
  expression = "";
  loading = false;
  error = null;
  payload = null;

  // view + plot config
  // grid | line | scatter | bar | area | histogram | box | heatmap | parallel | summary
  viewMode = "grid";
  xColumn = INDEX_COLUMN; // X axis
  yColumn = null; // Y axis (single numeric)
  zColumn = null; // Z axis (numeric, optional -> 3D when set for scatter/line)
  yColumns = []; // multi-select metrics, used by parallel coordinates
  colorColumn = null; // categorical dimension to color / group by
  selectedRow = null; // row index to highlight in the grid (e.g. from a plot click)

  constructor() {
    makeObservable(this, {
      kernel: observable.ref,
      expression: observable,
      loading: observable,
      error: observable,
      payload: observable.ref,
      viewMode: observable,
      xColumn: observable,
      yColumn: observable,
      zColumn: observable,
      yColumns: observable,
      colorColumn: observable,
      selectedRow: observable,
      isPython: computed,
      setExpression: action,
      load: action,
      loadExpression: action,
      refresh: action,
      reset: action,
      setPayload: action,
      setError: action,
      setViewMode: action,
      setXColumn: action,
      setYColumn: action,
      setZColumn: action,
      setColorColumn: action,
      setSelectedRow: action,
      toggleYColumn: action,
      _initPlotConfig: action,
    });
  }

  get isPython() {
    return Boolean(
      this.kernel &&
        this.kernel.language &&
        this.kernel.language.toLowerCase() === "python",
    );
  }

  setExpression = (text) => {
    this.expression = text;
  };

  // Feed the explorer with a kernel + expression (command / Variable Explorer).
  load = (kernel, expression) => {
    if (!kernel || !expression) {
      return;
    }
    this.kernel = kernel;
    this.expression = String(expression).trim();
    this._fetch();
  };

  // Re-run using the currently fed kernel (in-panel editor confirm).
  loadExpression = (expression) => {
    this.expression = String(expression).trim();
    this._fetch();
  };

  refresh = () => {
    if (this.expression) {
      this._fetch();
    }
  };

  // Clear the explorer, e.g. when its kernel is shut down.
  reset = () => {
    this.kernel = null;
    this.expression = "";
    this.payload = null;
    this.error = null;
    this.loading = false;
  };

  _fetch = () => {
    if (!this.kernel) {
      this.setError("No kernel. Run “Data Explorer” from an editor or notebook cell.");
      return;
    }
    if (!this.isPython) {
      this.setError("Data Explorer only works with Python kernels");
      return;
    }

    this.loading = true;
    this.error = null;

    const code = buildSerializerCode(this.expression);
    this.kernel.executeWatch(code, (result) => {
      if (result.output_type === "stream" && result.name === "stdout") {
        const text = (result.text || "").trim();
        if (!text) {
          return;
        }
        try {
          this.setPayload(JSON.parse(text));
        } catch (e) {
          // Output may arrive in chunks or be malformed; ignore partial JSON.
        }
      } else if (result.output_type === "error") {
        const message = `${result.ename || "Error"}: ${result.evalue || ""}`.trim();
        this.setError(message);
      }
    });
  };

  setPayload = (payload) => {
    this.loading = false;
    if (payload && payload.kind === "error") {
      this.error = payload.message || "Failed to load data";
      this.payload = null;
      return;
    }
    this.error = null;
    this.payload = payload;
    this.selectedRow = null;
    this._initPlotConfig();
  };

  setError = (message) => {
    this.loading = false;
    this.error = message;
    this.payload = null;
  };

  _initPlotConfig = () => {
    const payload = this.payload;
    if (!payload || !Array.isArray(payload.columns)) {
      this.xColumn = INDEX_COLUMN;
      this.yColumn = null;
      this.zColumn = null;
      this.yColumns = [];
      this.colorColumn = null;
      return;
    }
    const numeric = payload.numeric_columns || [];
    const columns = payload.columns || [];
    this.xColumn = INDEX_COLUMN;
    // Prefer a numeric column for the value axis, but fall back to any column so
    // DataFrames with non-numeric (e.g. object-dtype) columns are still plottable.
    this.yColumn = numeric[0] || columns[0] || null;
    this.zColumn = null;
    this.yColumns = numeric.slice(0, Math.min(numeric.length, 4));
    this.colorColumn = null;
  };

  setViewMode = (mode) => {
    this.viewMode = mode;
  };

  setXColumn = (column) => {
    this.xColumn = column;
  };

  setYColumn = (column) => {
    this.yColumn = column || null;
  };

  setZColumn = (column) => {
    this.zColumn = column || null;
  };

  setColorColumn = (column) => {
    this.colorColumn = column || null;
  };

  setSelectedRow = (rowIndex) => {
    // The highlight persists until the user dismisses it (clicking in the grid)
    // or a new plot point is clicked; no auto-hide timer.
    this.selectedRow = rowIndex;
  };

  toggleYColumn = (column) => {
    if (this.yColumns.includes(column)) {
      this.yColumns = this.yColumns.filter((c) => c !== column);
    } else {
      this.yColumns = [...this.yColumns, column];
    }
  };
}

// Single shared instance for the whole package.
const dataExplorerStore = new DataExplorerStore();
export default dataExplorerStore;
