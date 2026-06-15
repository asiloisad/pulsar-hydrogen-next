/** @babel */

import { action, observable, makeObservable } from "mobx";

function buildPythonResultInspectorCode(expression, targetName) {
  return `
def _hydrogen_next_inspector_eval():
    import ast
    _src = ${JSON.stringify(expression)}
    _target = ${JSON.stringify(targetName)}
    _tree = ast.parse(_src, mode="exec")
    _ns = dict(globals())
    if _tree.body and isinstance(_tree.body[-1], ast.Expr):
        _last = ast.Expression(_tree.body.pop().value)
        if _tree.body:
            exec(compile(_tree, "<inspector>", "exec"), _ns)
        globals()[_target] = eval(compile(_last, "<inspector>", "eval"), _ns)
    else:
        exec(compile(_tree, "<inspector>", "exec"), _ns)
        globals()[_target] = None
_hydrogen_next_inspector_eval()
del _hydrogen_next_inspector_eval
`;
}

function formatExecutionError(result) {
  if (Array.isArray(result.traceback) && result.traceback.length > 0) {
    return result.traceback.join("\n");
  }
  return `${result.ename || "Error"}: ${result.evalue || ""}`.trim();
}

export class InspectorStore {
  kernel = null;
  expression = "";
  cursorPos = 0;
  loading = false;
  error = null;
  bundle = null;
  _requestId = 0;

  constructor() {
    makeObservable(this, {
      kernel: observable.ref,
      expression: observable,
      cursorPos: observable,
      loading: observable,
      error: observable,
      bundle: observable.ref,
      setExpression: action,
      load: action,
      loadExpression: action,
      refresh: action,
      reset: action,
      setError: action,
      setBundle: action,
    });
  }

  setExpression = (text) => {
    this.expression = text;
  };

  load = (kernel, expression) => {
    this.kernel = kernel;
    this.expression = String(expression || "");
    this.cursorPos = this.expression.length;
    this._fetch();
  };

  loadExpression = (expression) => {
    this.expression = String(expression || "");
    this.cursorPos = this.expression.length;
    this._fetch();
  };

  refresh = () => {
    this.cursorPos = this.expression.length;
    this._fetch();
  };

  reset = () => {
    this.kernel = null;
    this.expression = "";
    this.cursorPos = 0;
    this.loading = false;
    this.error = null;
    this.bundle = null;
    this._requestId++;
  };

  _fetch = () => {
    const expression = this.expression;
    if (!this.kernel) {
      this.setError("No kernel running!");
      return;
    }
    if (!expression.trim()) {
      this.setError("No code to introspect!");
      return;
    }

    const requestId = ++this._requestId;
    this.loading = true;
    this.error = null;

    this.cursorPos = expression.length;
    if (this.kernel.language && this.kernel.language.toLowerCase() === "python") {
      this._fetchPythonExpressionResult(requestId, expression);
      return;
    }

    this._inspectExpression(requestId, expression, this.cursorPos);
  };

  _inspectExpression(requestId, expression, cursorPos, onDone = null) {
    this.kernel.inspect(expression, cursorPos, (result) => {
      if (requestId !== this._requestId) {
        return;
      }
      onDone?.();
      if (!result.found) {
        this.setError("No introspection available!");
      } else {
        this.setBundle(result.data);
      }
    });
  }

  _fetchPythonExpressionResult(requestId, expression) {
    const targetName = `__hydrogen_next_inspector_result_${requestId}`;
    const code = buildPythonResultInspectorCode(expression, targetName);
    let failed = false;
    let inspected = false;

    const cleanup = () => {
      this.kernel?.executeWatch?.(`globals().pop(${JSON.stringify(targetName)}, None)`, () => {});
    };

    this.kernel.executeWatch(code, (result) => {
      if (requestId !== this._requestId) {
        cleanup();
        return;
      }

      if (result.output_type === "error") {
        failed = true;
        cleanup();
        this.setError(formatExecutionError(result));
        return;
      }

      if (result.stream !== "status") {
        return;
      }

      if (result.data === "error") {
        failed = true;
        cleanup();
        if (!this.error) {
          this.setError("Failed to evaluate expression.");
        }
        return;
      }

      if (result.data === "ok" && !failed && !inspected) {
        inspected = true;
        this._inspectExpression(requestId, targetName, targetName.length, cleanup);
      }
    });
  }

  setError = (message) => {
    this.loading = false;
    this.error = message;
    this.bundle = null;
  };

  setBundle = (bundle) => {
    this.loading = false;
    this.error = null;
    this.bundle = bundle;
  };
}

const inspectorStore = new InspectorStore();
export default inspectorStore;
