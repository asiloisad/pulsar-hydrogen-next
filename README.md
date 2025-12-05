# hydrogen-next

A package provide an interactive coding environment that supports Python, R, JavaScript and other Jupyter kernels.

![demo](https://github.com/asiloisad/pulsar-hydrogen-next/blob/master/assets/demo.gif?raw=true)

## Installation

To install `hydrogen-next` search for [hydrogen-next](https://web.pulsar-edit.dev/packages/hydrogen-next) in the Install pane of the Pulsar settings or run `ppm install hydrogen-next`. Alternatively, you can run `ppm install asiloisad/pulsar-hydrogen-next` to install a package directly from the GitHub repository.

## Useful links

- https://github.com/nteract/hydrogen
- https://nteract.gitbooks.io/hydrogen/content/
- https://blog.nteract.io/hydrogen-interactive-computing-in-atom-89d291bcc4dd

## Features

`Hydrogen` & `hydrogen-next` core features:

- Execute a line, selection, or block of code.
- Rich media output: plots, images, video, HTML, LaTeX, and more.
- Watch expressions to automatically re-run and track variables.
- Kernel-powered completions (similar to Chrome DevTools autocomplete).
- Inline inspection of code objects from the running kernel.
- One kernel per language (share the same namespace across files).
- Interrupt or restart kernels when needed (Windows excluded).
- Support for custom kernel connections (e.g. inside Docker).
- Cell markers compatible with [navigation-panel](https://github.com/asiloisad/pulsar-navigation-panel).
- Cell markers compatible with [scroll-map](https://github.com/asiloisad/pulsar-scroll-map).

Enhancements exclusive to `hydrogen-next`:

- Full compatibility with Pulsar and PulsarNext without rebuilding.
- Updated dependencies: `jmp` and `zeromq` now use latest versions.
- Repaired socket monitoring for improved kernel stability.
- TypeScript code converted to JavaScript.
- Removed outdated text-editor context menu.
- Integrated `hydrogen-run`.
- Integrated `cell-navigation`.
- Removed breakpoints grammar, because tree-sitter is missing.
- Integrated `hydrogen-cell-separator` as markers.
- Correct evaluation of Python `if/elif/else` and `try/except/else/finally`.
- Run command supports multiple cursors and multi-selections.
- Run is no longer trimmed to the cell range.
- Added new command: `hydrogen-next:open-examples`.
- Updated inspector workflow.
- Fixed problem of "busy" stuck.
- Fixed notebook import command.
- Added variable explorer for Python.
- Fixed overcount issue by internal queue.
- Inline methods in sequence.
- Added exec panel with history.

## Code Block Detection

When you run code without a selection, hydrogen-next intelligently detects what to execute based on cursor position.

### Priority Order

1. **Selection** - If text is selected, execute exactly that
2. **Language Specials** - Python compound statements (see below)
3. **Brackets** - Multi-line bracket expressions `()`, `[]`, `{}`
4. **Folds** - Foldable language constructs
5. **Single Line** - Current line as fallback

### Python Support

| Cursor Position | What Gets Executed |
|-----------------|-------------------|
| On `def`/`class` line | Entire function/class (with decorators) |
| On `@decorator` line | Decorated function/class |
| On `if`/`elif`/`else` line | Entire if-elif-else chain |
| On `try`/`except`/`finally` line | Entire try block |
| On `for`/`while` line | Loop with optional `else` |
| On `with`/`match` line | Entire block |
| **Inside body** | **Single line only** |

### Bracket Expressions

| Cursor Position | What Gets Executed |
|-----------------|-------------------|
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

## Plugin API (v1.3.0)

Hydrogen-next provides a service API for other packages to interact with Jupyter kernels.

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
|--------|-------------|
| `getActiveKernel()` | Get the kernel for the active editor |
| `onDidChangeKernel(callback)` | Subscribe to kernel changes |
| `getCellRange(editor)` | Get the current cell range |

### HydrogenKernel API

#### Execution

| Method | Description |
|--------|-------------|
| `execute(code)` | Execute code, returns `Promise<{status, outputs, error}>` |
| `executeWithCallback(code, callback)` | Execute with streaming callback |

#### State & Control

| Property/Method | Description |
|-----------------|-------------|
| `executionState` | Current state: `'idle'`, `'busy'`, `'starting'` |
| `executionCount` | Current execution count |
| `lastExecutionTime` | Last execution time string (e.g., `"1.23s"`) |
| `onDidChangeExecutionState(callback)` | Subscribe to state changes, returns `Disposable` |
| `interrupt()` | Interrupt running execution |
| `restart([callback])` | Restart the kernel |
| `shutdown()` | Shutdown the kernel |

#### Introspection

| Method | Description |
|--------|-------------|
| `complete(code)` | Get completions, returns `Promise<{matches, ...}>` |
| `inspect(code, cursorPos)` | Get documentation, returns `Promise<{data, found}>` |

#### Kernel Info

| Property/Method | Description |
|-----------------|-------------|
| `language` | Kernel language (e.g., `"python"`) |
| `displayName` | Kernel display name (e.g., `"Python 3"`) |
| `kernelSpec` | Full kernel spec object |
| `getConnectionFile()` | Path to kernel connection file |

#### Events & Middleware

| Method | Description |
|--------|-------------|
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

# Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub — any feedback's welcome!
