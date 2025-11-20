/** @babel */

import { action, observable, computed } from "mobx"

export default class VariableExplorerStore {
    @observable
    variables = []

    @observable
    filterText = ""

    @observable
    autoRefresh = true  // Auto-refresh enabled by default

    constructor(kernel) {
        this.kernel = kernel
        // Add callback to refresh when kernel execution completes
        if (this.autoRefresh) {
            this.kernel.addWatchCallback(this.fetchVariables)
        }
    }

    @computed
    get filteredVariables() {
        console.log("Variable Explorer Store: filteredVariables called, variables:", this.variables, "filterText:", this.filterText)
        if (!this.filterText) {
            return this.variables
        }
        const filter = this.filterText.toLowerCase()
        return this.variables.filter(v =>
            v.name.toLowerCase().includes(filter)
        )
    }

    @action
    setFilterText = (text) => {
        this.filterText = text
    }

    @action
    toggleAutoRefresh = () => {
        console.log("Variable Explorer Store: toggleAutoRefresh called, current:", this.autoRefresh)
        this.autoRefresh = !this.autoRefresh
        if (this.autoRefresh) {
            this.kernel.addWatchCallback(this.fetchVariables)
            this.fetchVariables()
        } else {
            // Remove callback if auto-refresh is disabled
            const index = this.kernel.watchCallbacks.indexOf(this.fetchVariables)
            if (index > -1) {
                this.kernel.watchCallbacks.splice(index, 1)
            }
        }
    }

    @action
    fetchVariables = () => {
        if (!this.kernel) {
            console.log("Variable Explorer: No kernel available")
            return
        }

        console.log("Variable Explorer: Fetching variables...")

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
`

        this.kernel.executeWatch(code, (result) => {
            console.log("Variable Explorer: Received result", result)
            if (result.output_type === "stream" && result.name === "stdout") {
                try {
                    const variables = JSON.parse(result.text)
                    console.log("Variable Explorer: Parsed variables", variables)
                    this.setVariables(variables)
                } catch (e) {
                    console.error("Variable Explorer: Failed to parse variables:", e)
                }
            } else if (result.output_type === "error") {
                console.error("Variable Explorer: Python error:", result)
            }
        })
    }

    @action
    setVariables = (variables) => {
        console.log("Variable Explorer: Setting variables", variables.length, "items")
        this.variables = variables
    }

    @action
    editVariable = (name, newValue) => {
        if (!this.kernel) {
            return
        }

        // Python code to set variable value
        const code = `${name} = ${newValue}`

        this.kernel.execute(code, (result) => {
            if (result.output_type === "error") {
                atom.notifications.addError("Failed to set variable", {
                    description: result.traceback.join("\n"),
                    dismissable: true
                })
            } else {
                // Refresh variables after successful edit
                this.fetchVariables()
            }
        })
    }

    destroy() {
        // Remove watch callback if registered
        if (this.autoRefresh) {
            const index = this.kernel.watchCallbacks.indexOf(this.fetchVariables)
            if (index > -1) {
                this.kernel.watchCallbacks.splice(index, 1)
            }
        }
    }
}
