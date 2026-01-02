# hydrogen-next

Run code interactively with Jupyter kernels. Supports Python, R, JavaScript, and other languages with rich output including plots, images, HTML, and LaTeX.

![demo](https://github.com/asiloisad/pulsar-hydrogen-next/blob/master/assets/demo.gif?raw=true)

## Features

- **Interactive execution**: Run lines, selections, or code blocks with inline results.
- **Rich media output**: Displays plots, images, video, HTML, LaTeX, and more.
- **Watch expressions**: Auto-run and track variables.
- **Kernel completions**: Autocomplete powered by the running kernel.
- **Code introspection**: Inline inspection of objects from the kernel.
- **Shared namespace**: One kernel per language across files.
- **Smart code detection**: Intelligently detects Python blocks, brackets, and folds.
- **Variable explorer**: Browse Python variables in a dedicated panel.
- **Exec panel**: Command history with re-execution support.
- **Multi-cursor support**: Run with multiple cursors and selections.
- **Custom connections**: Connect to remote kernels (e.g., Docker).
- **Navigation panel**: Cell markers via [navigation-panel](https://github.com/asiloisad/pulsar-navigation-panel).
- **Scrollmap**: Cell markers via [scrollmap](https://github.com/asiloisad/pulsar-scrollmap).

## Installation

To install `hydrogen-next` search for [hydrogen-next](https://web.pulsar-edit.dev/packages/hydrogen-next) in the Install pane of the Pulsar settings or run `ppm install hydrogen-next`. Alternatively, you can run `ppm install asiloisad/pulsar-hydrogen-next` to install a package directly from the GitHub repository.

## Kernel selection

When multiple kernels are available for a language, you can specify which kernel to use with a magic comment `#::` on the first line.

```python
#:: python3
import numpy as np
```

Matching rules:

- **Case-sensitive**: Must match exactly (e.g., `python3` not `Python3`)
- **Kernel name**: The directory name from `jupyter kernelspec list` (e.g., `python3`)
- **Display name**: The human-readable name (e.g., `Python 3.13`)

If no match is found, falls back to normal behavior (picker or auto-select).

In the kernel picker, press **Ctrl+Enter** to insert the selected kernel as a magic comment instead of starting it.

## Kernel gateways

Connect to remote or local Jupyter servers by configuring kernel gateways in settings.

Example of local jupyter server:

```bash
jupyter server --ServerApp.token='test123'
```

In the hydrogen-next settings, add gateway entries as JSON:

```json
[
  {
    "name": "Local Jupyter",
    "options": {
      "baseUrl": "http://localhost:8888",
    }
  }
]
```

Use `Hydrogen: Connect to Remote Kernel` command to select a gateway and kernel.

## Code block detection

When you run code without a selection, hydrogen-next intelligently detects what to execute based on cursor position.

### Priority order

1. **Selection** - If text is selected, execute exactly that
2. **Language Specials** - Python compound statements (see below)
3. **Brackets** - Multi-line bracket expressions `()`, `[]`, `{}`
4. **Folds** - Foldable language constructs
5. **Single Line** - Current line as fallback

### Python support

| Cursor Position | What Gets Executed |
| --- | --- |
| On `def`/`class` line | Entire function/class (with decorators) |
| On `@decorator` line | Decorated function/class |
| On `if`/`elif`/`else` line | Entire if-elif-else chain |
| On `try`/`except`/`finally` line | Entire try block |
| On `for`/`while` line | Loop with optional `else` |
| On `with`/`match` line | Entire block |
| **Inside body** | **Single line only** |

### Bracket expressions

| Cursor Position | What Gets Executed |
| --- | --- |
| On line ending with `[`, `(`, `{` | Entire bracket block |
| On line starting with `]`, `)`, `}` | Entire bracket block |
| **Inside bracket block** | **Single line only** |

### Examples

```python
# Cursor on "if" → executes entire if-elif-else
if x > 0:
    print("positive")
elif x < 0:
    print("negative")
else:
    print("zero")

# Cursor on "print" inside body → executes only that line
if x > 0:
    print("positive")  # ← cursor here = single line

# Cursor on "[" → executes entire list
data = [
    1,
    2,
    3,
]

# Cursor on "2," inside list → executes only "2,"
data = [
    1,
    2,  # ← cursor here = single line
    3,
]
```

This allows you to execute entire blocks from control lines, while still being able to inspect individual lines inside bodies.

## Service

The package provides a `hydrogen.provider` service for other packages to interact with Jupyter kernels.

### Consuming the Service

In your `package.json`:

```json
{
  "consumedServices": {
    "hydrogen.provider": {
      "versions": {
        "^1.3.0": "consumeHydrogen"
      }
    }
  }
}
```

In your package:

```javascript
module.exports = {
  consumeHydrogen(hydrogen) {
    this.hydrogen = hydrogen;
  },

  async example() {
    const kernel = this.hydrogen.getActiveKernel();
    const result = await kernel.execute("print('Hello')");
    console.log(result.status); // 'ok' or 'error'
  }
};
```

### HydrogenProvider Methods

| Method | Description |
| --- | --- |
| `getActiveKernel()` | Get the kernel for the active editor |
| `onDidChangeKernel(callback)` | Subscribe to kernel changes |
| `getCellRange(editor)` | Get the current cell range |

### HydrogenKernel API

#### Execution

| Method | Description |
| --- | --- |
| `execute(code)` | Execute code, returns `Promise<{status, outputs, error}>` |
| `executeWithCallback(code, callback)` | Execute with streaming callback |

#### State & Control

| Property/Method | Description |
| --- | --- |
| `executionState` | Current state: `'idle'`, `'busy'`, `'starting'` |
| `executionCount` | Current execution count |
| `lastExecutionTime` | Last execution time string (e.g., `"1.23s"`) |
| `onDidChangeExecutionState(callback)` | Subscribe to state changes, returns `Disposable` |
| `interrupt()` | Interrupt running execution |
| `restart([callback])` | Restart the kernel |
| `shutdown()` | Shutdown the kernel |

#### Introspection

| Method | Description |
| --- | --- |
| `complete(code)` | Get completions, returns `Promise<{matches, ...}>` |
| `inspect(code, cursorPos)` | Get documentation, returns `Promise<{data, found}>` |

#### Kernel info

| Property/Method | Description |
| --- | --- |
| `language` | Kernel language (e.g., `"python"`) |
| `displayName` | Kernel display name (e.g., `"Python 3"`) |
| `kernelSpec` | Full kernel spec object |
| `getConnectionFile()` | Path to kernel connection file |

#### Events & Middleware

| Method | Description |
| --- | --- |
| `onDidDestroy(callback)` | Called when kernel is destroyed |
| `addMiddleware(middleware)` | Add execution middleware |

### Example: Execute and Handle Results

```javascript
async function runCode(hydrogen) {
  const kernel = hydrogen.getActiveKernel();

  // Simple execution
  const result = await kernel.execute("x = 42\nprint(x)");

  if (result.status === "ok") {
    console.log("Outputs:", result.outputs);
  } else {
    console.error(`${result.error.ename}: ${result.error.evalue}`);
  }

  // Monitor state
  const disposable = kernel.onDidChangeExecutionState((state) => {
    console.log("Kernel state:", state);
  });

  // Get completions
  const completions = await kernel.complete("import nu");
  console.log(completions.matches); // ['numpy', 'numbers', ...]

  // Cleanup
  disposable.dispose();
}
```

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub — any feedback's welcome!
