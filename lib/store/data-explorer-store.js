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

    _SCALAR = (type(None), bool, int, float, complex, str, bytes)

    def _expandable(v):
        # Can we drill into this value (does it hold inner structure)?
        if isinstance(v, _SCALAR):
            return False
        try:
            import numpy as _np
            if isinstance(v, _np.generic):
                return False
        except Exception:
            pass
        if isinstance(v, (list, tuple, set, frozenset, dict)):
            return len(v) > 0
        for b in type(v).__mro__:
            if getattr(b, "__name__", "") in ("DataFrame", "Series", "ndarray"):
                try:
                    return len(v) > 0
                except Exception:
                    return True
        try:
            return bool([n for n in dir(v) if not (n.startswith("__") and n.endswith("__"))])
        except Exception:
            return False

    def _key_accessor(k):
        # Subscript accessor "[<repr>]" that round-trips, for simple literal keys.
        if isinstance(k, _SCALAR):
            try:
                return "[%s]" % repr(k)
            except Exception:
                return None
        return None

    def _preview(v, limit=300):
        try:
            text = repr(v)
        except Exception as e:
            text = "<repr failed: %s>" % e
        text = text.replace("\\r", "\\\\r").replace("\\n", " ")
        if len(text) > limit:
            text = text[:limit - 1] + "..."
        return text

    def _doc_preview(v, limit=240):
        if v is None:
            return ""
        doc = getattr(v, "__doc__", None)
        if not doc:
            return ""
        text = " ".join(str(doc).strip().split())
        if len(text) > limit:
            text = text[:limit - 1] + "..."
        return text

    def _signature(v):
        try:
            import inspect
            return str(inspect.signature(v))
        except Exception:
            return ""

    def _member_category(static_value, runtime_value):
        try:
            import inspect
            if isinstance(static_value, property):
                return "property"
            if inspect.ismodule(runtime_value):
                return "module"
            if inspect.isclass(runtime_value):
                return "class"
            if inspect.ismethod(runtime_value):
                return "method"
            if inspect.isfunction(runtime_value):
                return "function"
            if inspect.isroutine(runtime_value):
                return "method"
            if callable(runtime_value):
                return "callable"
        except Exception:
            pass
        return "attribute"

    def _object_members(obj):
        import inspect
        rows = []
        navmeta = []
        names = []
        try:
            names = dir(obj)
        except Exception:
            names = []

        # Prefer the usable API surface. Dunder names are usually inherited
        # protocol noise, so hide them unless that is all the object exposes.
        non_dunder = [n for n in names if not (n.startswith("__") and n.endswith("__"))]
        if non_dunder:
            names = non_dunder
        names = sorted(names, key=lambda n: (n.startswith("_"), n.lower()))
        for name in names[:MAX_ROWS]:
            try:
                static_value = inspect.getattr_static(obj, name)
            except Exception:
                static_value = None
            try:
                runtime_value = getattr(obj, name)
                error = ""
            except Exception as e:
                runtime_value = None
                error = "%s: %s" % (type(e).__name__, e)

            type_name = type(runtime_value).__name__ if not error else type(static_value).__name__
            category = _member_category(static_value, runtime_value)
            signature = _signature(runtime_value) if not error and category in (
                "class", "method", "function", "callable"
            ) else ""
            value = error or _preview(runtime_value)
            if category == "property":
                doc_source = static_value
            elif category == "attribute":
                doc_source = None
            else:
                doc_source = runtime_value if not error else static_value
            rows.append([
                name,
                category,
                type_name,
                value,
                signature,
                _doc_preview(doc_source),
            ])
            accessor = ".%s" % name if name.isidentifier() else None
            navmeta.append({
                "accessor": accessor,
                "expandable": bool(accessor) and not error and _expandable(runtime_value),
            })
        return names, rows, navmeta

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
            result["navmeta"] = [{"accessor": ".iloc[%d]" % i, "expandable": True}
                                 for i in range(int(sub.shape[0]))]
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
            result["navmeta"] = [{"accessor": ".iloc[%d]" % i, "expandable": _expandable(v)}
                                 for i, v in enumerate(sub.tolist())]
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
                result["navmeta"] = [{"accessor": "[%d]" % i, "expandable": _expandable(v)}
                                     for i, v in enumerate(arr.tolist())]
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
                result["navmeta"] = [{"accessor": "[%d]" % r, "expandable": ncols > 0}
                                     for r in range(int(arr.shape[0]))]
            else:
                result.update({
                    "kind": "scalar", "shape": shape, "dtype": dtype,
                    "repr": "ndarray(shape=%s, dtype=%s)\\n%s" % (shape, dtype, repr(_obj)[:2000]),
                })
        elif isinstance(_obj, (list, tuple)):
            total = len(_obj)
            seq = list(_obj)[:MAX_ROWS]
            navmeta = [{"accessor": "[%d]" % i, "expandable": _expandable(x)}
                       for i, x in enumerate(seq)]
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
                    "rows": rows, "navmeta": navmeta,
                    "total_rows": total, "truncated": total > MAX_ROWS,
                    "numeric_columns": [],
                })
            elif seq and all(isinstance(x, (list, tuple)) for x in seq):
                ncols = min(max(len(x) for x in seq), MAX_COLS)
                cols = ["col%d" % i for i in range(ncols)]
                rows = [[_clean(x[i]) if i < len(x) else None for i in range(ncols)] for x in seq]
                result.update({
                    "kind": "list", "columns": cols,
                    "index": [str(i) for i in range(len(seq))],
                    "rows": rows, "navmeta": navmeta,
                    "total_rows": total, "truncated": total > MAX_ROWS,
                    "numeric_columns": cols,
                })
            else:
                allnum = all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in seq)
                result.update({
                    "kind": "list", "columns": ["value"],
                    "index": [str(i) for i in range(len(seq))],
                    "rows": [[_clean(x)] for x in seq], "navmeta": navmeta,
                    "total_rows": total, "truncated": total > MAX_ROWS,
                    "numeric_columns": ["value"] if allnum else [],
                })
        elif isinstance(_obj, dict):
            total = len(_obj)
            items = list(_obj.items())[:MAX_ROWS]
            navmeta = []
            for k, v in items:
                acc = _key_accessor(k)
                navmeta.append({"accessor": acc, "expandable": bool(acc) and _expandable(v)})
            result.update({
                "kind": "dict", "columns": ["key", "value"],
                "index": [str(i) for i in range(len(items))],
                "rows": [[_clean(k), _clean(v)] for k, v in items],
                "navmeta": navmeta,
                "total_rows": total, "truncated": total > MAX_ROWS,
                "numeric_columns": [],
            })
        else:
            scalar_types = (type(None), bool, int, float, complex, str, bytes)
            if isinstance(_obj, scalar_types):
                result.update({"kind": "scalar", "repr": _preview(_obj, 2000)})
            else:
                names, rows, navmeta = _object_members(_obj)
                if rows:
                    result.update({
                        "kind": "object",
                        "type": "%s.%s" % (type(_obj).__module__, type(_obj).__name__),
                        "repr": _preview(_obj, 2000),
                        "columns": ["name", "category", "type", "value", "signature", "doc"],
                        "index": [str(i) for i in range(len(rows))],
                        "rows": rows,
                        "navmeta": navmeta,
                        "total_rows": len(names),
                        "truncated": len(names) > MAX_ROWS,
                        "numeric_columns": [],
                    })
                else:
                    result.update({"kind": "scalar", "repr": _preview(_obj, 2000)})
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
  // Drill-down breadcrumb. Each segment is { label, expression }; segment 0 is
  // the root expression, later segments append accessors (e.g. ["k"], [0], .attr).
  path = [];
  // Bumped on each drill navigation so the panel can refocus the grid once the
  // new level has rendered (drilling unmounts the old grid while loading).
  focusToken = 0;
  // Grid state (selection + scroll) to restore when stepping back to a level we
  // previously drilled out of; consumed by the grid once it has re-rendered.
  pendingRestore = null;

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
      path: observable,
      pendingRestore: observable.ref,
      isPython: computed,
      currentExpression: computed,
      setExpression: action,
      load: action,
      loadExpression: action,
      drillInto: action,
      navigateTo: action,
      drillUp: action,
      clearPendingRestore: action,
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

  // The expression actually evaluated / shown in the grid. This is the tail of
  // the drill path, which may be deeper than `expression` (what the editor
  // shows). The editor keeps the root the user typed; the breadcrumb conveys the
  // current depth, so drilling never rewrites the editor.
  get currentExpression() {
    return this.path.length > 0 ? this.path[this.path.length - 1].expression : this.expression;
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
    this.path = [{ label: this.expression, expression: this.expression }];
    this.pendingRestore = null;
    this._fetch();
  };

  // Re-run using the currently fed kernel (in-panel editor confirm). A manual
  // expression resets the drill breadcrumb to a new root.
  loadExpression = (expression) => {
    this.expression = String(expression).trim();
    this.path = [{ label: this.expression, expression: this.expression }];
    this.pendingRestore = null;
    this._fetch();
  };

  // Drill into the value at `rowIndex`, appending its accessor to the current
  // expression and re-fetching. The editor expression is left untouched (the
  // breadcrumb shows the depth). `gridState` is the position being left behind,
  // stored on the current level so stepping back can restore it. No-op for rows
  // that aren't expandable.
  drillInto = (rowIndex, gridState) => {
    const payload = this.payload;
    const meta = payload && payload.navmeta && payload.navmeta[rowIndex];
    if (!meta || !meta.expandable || !meta.accessor) {
      return;
    }
    const expression = `${this.currentExpression}${meta.accessor}`;
    const path = this.path.slice();
    if (path.length > 0) {
      path[path.length - 1] = { ...path[path.length - 1], gridState };
    }
    path.push({ label: meta.accessor, expression });
    this.path = path;
    this.focusToken += 1;
    this._fetch();
  };

  // Jump to a breadcrumb segment (truncating everything below it). Also the path
  // used by drillUp, so it covers Backspace navigation too. The grid position
  // saved when leaving that level is queued for restore.
  navigateTo = (index) => {
    const segment = this.path[index];
    if (!segment) {
      return;
    }
    this.path = this.path.slice(0, index + 1);
    this.pendingRestore = segment.gridState || null;
    this.focusToken += 1;
    this._fetch();
  };

  // Climb one level out of the current drill path.
  drillUp = () => {
    if (this.path.length > 1) {
      this.navigateTo(this.path.length - 2);
    }
  };

  // Consumed by the grid once it has applied a restored position.
  clearPendingRestore = () => {
    this.pendingRestore = null;
  };

  refresh = () => {
    if (this.currentExpression) {
      this._fetch();
    }
  };

  // Clear the explorer, e.g. when its kernel is shut down.
  reset = () => {
    this.kernel = null;
    this.expression = "";
    this.path = [];
    this.pendingRestore = null;
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

    const code = buildSerializerCode(this.currentExpression);
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
