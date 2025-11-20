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
- Interrupt or restart kernels when needed (Windows exclueded).
- Support for custom kernel connections (e.g. inside Docker).
- Cell markers compatible with [navigation-panel](https://github.com/asiloisad/pulsar-navigation-panel).

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

## Alternative keymaps

You can disable the predefined keymap and use your own in `keymap.cson`. An example:

```cson
"atom-text-editor:not([mini])":
  "ctrl-enter" : "hydrogen-next:run"
  "shift-enter": "hydrogen-next:run-and-move-down"
  "f5"         : "hydrogen-next:run-all"
  "alt-f5"     : "hydrogen-next:recalculate-all"
  "shift-f5"   : "hydrogen-next:run-all-above"
  "ctrl-f5"    : "hydrogen-next:recalculate-all-above"
  "f6"         : "hydrogen-next:run-all-inline"
  "alt-f6"     : "hydrogen-next:recalculate-all-inline"
  "shift-f6"   : "hydrogen-next:run-all-above-inline"
  "ctrl-f6"    : "hydrogen-next:recalculate-all-above-inline"
  "f7"         : "hydrogen-next:run"
  "ctrl-f7"    : "hydrogen-next:run-cell"
  "alt-f7"     : "hydrogen-next:clear-and-center"
  "shift-f7"   : "hydrogen-next:interrupt-kernel"
  "f8"         : "hydrogen-next:run-and-move-down"
  "ctrl-f8"    : "hydrogen-next:run-cell-and-move-down"
  "alt-f8"     : "hydrogen-next:clear-and-restart"
  "shift-f8"   : "hydrogen-next:shutdown-kernel"
```

# Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub — any feedback’s welcome!

Thanks to [@mauricioszabo](https://github.com/mauricioszabo) for showing me a way to get hydrogen to work in the latest Electron.
