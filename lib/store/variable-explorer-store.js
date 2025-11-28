/** @babel */

import { action, observable, computed, makeObservable } from "mobx";

export default class VariableExplorerStore {
  variables = [];
  filterText = "";
  autoRefresh = true;

  constructor(kernel) {
    makeObservable(this, {
      variables: observable,
      filterText: observable,
      autoRefresh: observable,
      filteredVariables: computed,
      setFilterText: action,
      toggleAutoRefresh: action,
      fetchVariables: action,
      _doFetchVariables: action,
      setVariables: action,
      editVariable: action,
    });

    this.kernel = kernel;
    this._watchCallbackRegistered = false;
    // Add callback to refresh when kernel execution completes
    if (this.autoRefresh) {
      this._registerWatchCallback();
    }
  }

  _registerWatchCallback() {
    if (!this._watchCallbackRegistered) {
      this.kernel.addWatchCallback(this.fetchVariables);
      this._watchCallbackRegistered = true;
    }
  }

  _unregisterWatchCallback() {
    if (this._watchCallbackRegistered) {
      const index = this.kernel.watchCallbacks.indexOf(this.fetchVariables);
      if (index > -1) {
        this.kernel.watchCallbacks.splice(index, 1);
      }
      this._watchCallbackRegistered = false;
    }
  }

  get filteredVariables() {
    if (!this.filterText) {
      return this.variables;
    }
    const filter = this.filterText.toLowerCase();
    return this.variables.filter((v) => v.name.toLowerCase().includes(filter));
  }

  setFilterText = (text) => {
    this.filterText = text;
  };

  toggleAutoRefresh = () => {
    this.autoRefresh = !this.autoRefresh;
    if (this.autoRefresh) {
      this._registerWatchCallback();
      this.fetchVariables();
    } else {
      this._unregisterWatchCallback();
    }
  };

  fetchVariables = () => {
    if (!this.kernel) {
      return;
    }
    this._doFetchVariables();
  };

  _doFetchVariables = () => {
    if (!this.kernel) {
      return;
    }

    // Check if kernel is Python before fetching variables
    if (
      !this.kernel.language ||
      this.kernel.language.toLowerCase() !== "python"
    ) {
      // Clear variables if not a Python kernel
      this.setVariables([]);
      return;
    }

    // Python code to extract variables with type and repr information
    const code = `
import sys
import json
from io import StringIO

def _get_variables():
    # Get all variables from user namespace
    user_vars = {}
    # Variables to skip
    skip_vars = {'get_ipython', 'exit', 'quit', 'open', 'sys', 'json', 'StringIO', 'In', 'Out'}

    for name, value in globals().items():
        # Skip private variables, modules, and system variables
        if name.startswith('_') or name in skip_vars:
            continue
        if hasattr(value, '__module__'):
            if value.__module__ == '__main__' or value.__module__ is None:
                pass  # Include user-defined classes
            elif callable(value) and not hasattr(value, '__dict__'):
                continue  # Skip built-in functions

        try:
            var_type = type(value).__name__

            # Try special repr methods first
            repr_data = {}

            # Check for IPython.display.Image
            if hasattr(value, '__module__') and value.__module__ == 'IPython.core.display' and type(value).__name__ == 'Image':
                try:
                    import base64
                    if hasattr(value, 'data') and value.data:
                        if getattr(value, 'format', '') == 'png':
                            repr_data['png'] = base64.b64encode(value.data).decode('ascii')
                        elif getattr(value, 'format', '') in ('jpeg', 'jpg'):
                            repr_data['jpeg'] = base64.b64encode(value.data).decode('ascii')
                except:
                    pass

            # Check for numpy arrays
            if var_type == 'ndarray':
                try:
                    import numpy as np
                    # For numpy arrays, show shape and dtype
                    repr_data['text'] = f"array(shape={value.shape}, dtype={value.dtype})"
                    # Also try to show small arrays
                    if value.size <= 100:
                        repr_data['pretty'] = repr(value)
                except:
                    pass

            # Check for _repr_markdown_
            if hasattr(value, '_repr_markdown_'):
                try:
                    repr_data['markdown'] = value._repr_markdown_()
                except:
                    pass

            # Check for _repr_html_
            if hasattr(value, '_repr_html_'):
                try:
                    repr_data['html'] = value._repr_html_()
                except:
                    pass

            # Check for _repr_pretty_
            if hasattr(value, '_repr_pretty_'):
                try:
                    from io import StringIO
                    sio = StringIO()
                    value._repr_pretty_(sio, False)
                    repr_data['pretty'] = sio.getvalue()
                except:
                    pass

            # Check for _repr_png_
            if hasattr(value, '_repr_png_'):
                try:
                    import base64
                    png_data = value._repr_png_()
                    if isinstance(png_data, bytes):
                        repr_data['png'] = base64.b64encode(png_data).decode('ascii')
                except:
                    pass

            # Check for _repr_jpeg_ or _repr_jpg_
            if hasattr(value, '_repr_jpeg_'):
                try:
                    import base64
                    jpg_data = value._repr_jpeg_()
                    if isinstance(jpg_data, bytes):
                        repr_data['jpeg'] = base64.b64encode(jpg_data).decode('ascii')
                except:
                    pass
            elif hasattr(value, '_repr_jpg_'):
                try:
                    import base64
                    jpg_data = value._repr_jpg_()
                    if isinstance(jpg_data, bytes):
                        repr_data['jpeg'] = base64.b64encode(jpg_data).decode('ascii')
                except:
                    pass

            # Fallback to regular repr
            if not repr_data:
                repr_str = repr(value)
                # Limit length for very long reprs
                if len(repr_str) > 1000:
                    repr_str = repr_str[:1000] + '...'
                repr_data['text'] = repr_str

            user_vars[name] = {
                'name': name,
                'type': var_type,
                'repr': repr_data
            }
        except:
            # Skip variables that can't be repr'd
            pass

    return list(user_vars.values())

print(json.dumps(_get_variables()))
del _get_variables
`;

    this.kernel.executeWatch(code, (result) => {
      if (result.output_type === "stream" && result.name === "stdout") {
        try {
          const variables = JSON.parse(result.text);
          this.setVariables(variables);
        } catch (e) {
          // JSON parsing failed - likely incomplete or malformed output
        }
      }
    });
  };

  setVariables = (variables) => {
    this.variables = variables;
  };

  editVariable = (name, newValue) => {
    if (!this.kernel) {
      return;
    }

    // Check if kernel is Python before editing
    if (
      !this.kernel.language ||
      this.kernel.language.toLowerCase() !== "python"
    ) {
      atom.notifications.addWarning(
        "Variable editing only works with Python kernels",
        {
          dismissable: true,
        }
      );
      return;
    }

    // Python code to set variable value
    const code = `${name} = ${newValue}`;

    this.kernel.execute(code, (result) => {
      if (result.output_type === "error") {
        const traceback = result.traceback;
        const description = Array.isArray(traceback)
          ? traceback.join("\n")
          : result.evalue || "Unknown error";
        atom.notifications.addError("Failed to set variable", {
          description,
          dismissable: true,
        });
      } else {
        // Refresh variables after successful edit
        this.fetchVariables();
      }
    });
  };

  destroy() {
    // Remove watch callback if registered
    this._unregisterWatchCallback();
  }
}
