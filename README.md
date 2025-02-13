# hydrogen-next

A package provide an interactive coding environment that supports Python, R, JavaScript and other Jupyter kernels.

![demo](https://github.com/bacadra/pulsar-hydrogen-next/blob/master/assets/demo.gif?raw=true)

## Installation

To install `hydrogen-next` search for [hydrogen-next](https://web.pulsar-edit.dev/packages/hydrogen-next) in the Install pane of the Pulsar settings or run `ppm install hydrogen-next`. Alternatively, you can run `ppm install bacadra/pulsar-hydrogen-next` to install a package directly from the Github repository.

## Useful links

- https://github.com/nteract/hydrogen
- https://nteract.gitbooks.io/hydrogen/content/
- https://blog.nteract.io/hydrogen-interactive-computing-in-atom-89d291bcc4dd

## Features

Featues of `hydrogen` & `hydrogen-next`:

- Execute a line, selection, or block at a time.
- Rich media support for plots, images, and video.
- Watch expressions let you keep track of variables and re-run snippets after every change.
- Completions from the running kernel, just like autocomplete in the Chrome dev tools.
- Code can be inspected to show useful information provided by the running kernel.
- One kernel per language (so you can run snippets from several files, all in the same namespace).
- Interrupt or restart the kernel if anything goes wrong.
- Use a custom kernel connection (for example to run code inside Docker), read more in the "Custom kernel connection (inside Docker)" section.

Features of `hydrogen-next`:

- Package works well in Pulsar and PulsarNext without rebuilding.
- Dependencies `jmp` & `zeromq` updated to latest version.
- Socket monitors fixed.
- Converted `.ts` and `.tsx` libs to java script.
- All configuration `hydrogen.` renamed to `hydrogen-next.`.
- All commands `hydrogen:` renamed to `hydrogen-next:`.
- All styles `hydrogen.` renamed to `hydrogen-next.`.
- Text editor context menu removed.
- Integrated `hydrogen-run` package.
- Integrated `cell-navigation` package.
- Evaluation of Python `if|elif|else` and `try|except|else|finally` fixed.
- Command `Run` supports multiple cursors.
- New command `:open-examples` added.
- Inspector workflow changed.

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

# TODO

- Add Variable Explorer (like [hydrogen-python](https://github.com/nikitakit/hydrogen-python)).
- Fix `Editor is not responsible` when loading package.
- Add setting to swap keymaps set.
- Extend Python code to decatorators.

# Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub — any feedback’s welcome!

Thanks to [@mauricioszabo](https://github.com/mauricioszabo) for showing me a way to get hydrogen to work in the latest Electron.
