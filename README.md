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

Featues of `hydrogen-next`:

- Package works well in Pulsar and PulsarNext without rebuild.
- Dependencies `jmp` & `zeromq` updated to latest version.
- Socket monitors fixed.
- Libs `.ts`. and `.tsx` converted to java script.
- PulsarNext React-Table CSS fixed.
- All config `Hydrogen.` renamed to `hydrogen-next.`.
- All commands `hydrogen:` renamed to `hydrogen-next:`.
- All styles `hydrogen.` renamed to `hydrogen-next.`.
- Context menu of text-editor cleared.
- Integrated `hydrogen-run` package.
- Python `if|elif|else` and `try|except|else|finally` extended.

## Alternative keymaps

```cson
'atom-text-editor:not([mini])':
  'ctrl-enter' : 'hydrogen-next:run'
  'shift-enter': 'hydrogen-next:run-and-move-down'
  'f5'         : 'hydrogen-next:run-all'
  'alt-f5'     : 'hydrogen-run:recalculate-all'
  'shift-f5'   : 'hydrogen-next:run-all-above'
  'ctrl-f5'    : 'hydrogen-run:recalculate-all-above'
  'f6'         : 'hydrogen-run:run-all-inline'
  'alt-f6'     : 'hydrogen-run:recalculate-all-inline'
  'shift-f6'   : 'hydrogen-run:run-all-above-inline'
  'ctrl-f6'    : 'hydrogen-run:recalculate-all-above-inline'
  'f7'         : 'hydrogen-next:run'
  'ctrl-f7'    : 'hydrogen-next:run-cell'
  'alt-f7'     : 'hydrogen-run:clear-and-center'
  'shift-f7'   : 'hydrogen-next:interrupt-kernel'
  'f8'         : 'hydrogen-next:run-and-move-down'
  'ctrl-f8'    : 'hydrogen-next:run-cell-and-move-down'
  'alt-f8'     : 'hydrogen-run:clear-and-restart'
  'shift-f8'   : 'hydrogen-next:shutdown-kernel'
  'f9'         : 'hydrogen-next:toggle-inspector'
```

# TODO

- [ ] Add Variable Explorer (like [hydrogen-python](https://github.com/nikitakit/hydrogen-python)).
- [ ] Fix `Editor is not responsible` while package is loading.
- [ ] Add setting to swap keymaps set.

# Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub — any feedback’s welcome!

Thanks to [@mauricioszabo](https://github.com/mauricioszabo) for showing me a way to get hydrogen to work in the latest Electron.
