'use babel'

const Config = {
  getJson(key, _default = {}) {
    const value = atom.config.get(`hydrogen-next.${key}`)
    if (!value || typeof value !== "string") {
      return _default
    }

    try {
      return JSON.parse(value)
    } catch (error) {
      const message = `Your Hydrogen config is broken: ${key}`
      atom.notifications.addError(message, {
        detail: error
      })
    }

    return _default
  },

  schema: {
    autocomplete: {
      title: "Enable Autocomplete",
      description:
        "If enabled, use autocomplete options provided by the current kernel.",
      type: "boolean",
      default: true,
      order: 1,
    },
    autocompleteWatches: {
      title: "Enable Autocomplete for Watch pane",
      description:
        "Autocompletes entries in the Watch pane field.",
      type: "boolean",
      default: true,
      order: 2,
    },
    autocompleteSuggestionPriority: {
      title: "Autocomple Suggestion Priority",
      description:
        "Specify the sort order of Hydrogen's autocomplete suggestions. Note the default providers like snippets have priority of `1`.",
      type: "integer",
      default: 3,
      order: 3,
    },
    showInspectorResultsInAutocomplete: {
      title: "Enable Autocomplete description",
      description:
        "If enabled, Hydrogen will try to show [the results from kernel inspection](https://nteract.gitbooks.io/hydrogen/docs/Usage/GettingStarted.html#hydrogen-toggle-inspector) in each autocomplete suggestion's description. ⚠ May slow down the autocompletion performance. (**Note**: Even if you disable this, you would still get autocomplete suggestions.)",
      type: "boolean",
      default: false,
      order: 4,
    },
    importNotebookURI: {
      title: "Enable Notebook Auto-import",
      description:
        "If enabled, opening a file with extension `.ipynb` will [import the notebook](https://nteract.gitbooks.io/hydrogen/docs/Usage/NotebookFiles.html#notebook-import) file's source into a new tab. If disabled, or if the Hydrogen package is not activated, the raw file will open in Atom as normal.",
      type: "boolean",
      default: true,
      order: 5,
    },
    importNotebookResults: {
      title: "Enable Import of Notebook Results",
      description:
        "If enabled, anytime you import a notebook, the saved results are also rendered inline. If disabled, you can still import notebooks as normal.",
      type: "boolean",
      default: true,
      order: 6,
    },
    statusBarDisable: {
      title: "Disable the Hydrogen status bar",
      description:
        "If enabled, no kernel information will be provided in Atom's status bar.",
      type: "boolean",
      default: false,
      order: 7,
    },
    statusBarKernelInfo: {
      title: "Detailed kernel information in the Hydrogen status bar",
      description:
        "If enabled, more detailed kernel information (execution count, execution time if available) will be shown in the Hydrogen status bar. This requires the above **Disable the Hydrogen status bar** setting to be `false` to work.",
      type: "boolean",
      default: true,
      order: 8,
    },
    autoKernelPicker: {
      title: "Auto Kernel Picker",
      description:
        'Automatically select kernel if only kernel available',
      type: "boolean",
      default: true,
      order: 9,
    },
    debug: {
      title: "Enable Debug Messages",
      description: "If enabled, log debug messages onto the dev console.",
      type: "boolean",
      default: false,
      order: 10,
    },
    autoScroll: {
      title: "Enable Autoscroll",
      description:
        "If enabled, Hydrogen will automatically scroll to the bottom of the result view.",
      type: "boolean",
      default: true,
      order: 11,
    },
    centerOnMoveDown: {
      title: "Center on Move Down",
      description:
        "If enabled, running center-and-move-down will center the screen on the new line",
      type: "boolean",
      default: false,
      order: 12,
    },
    wrapOutput: {
      title: "Enable Soft Wrap for Output",
      description:
        "If enabled, your output code from Hydrogen will break long text and items.",
      type: "boolean",
      default: true,
      order: 13,
    },
    outputAreaDefault: {
      title: "View output in the dock by default",
      description:
        "If enabled, output will be displayed in the dock by default rather than inline",
      type: "boolean",
      default: false,
      order: 14,
    },
    outputAreaDock: {
      title: "Leave output dock open",
      description:
        "Do not close dock when switching to an editor without a running kernel",
      type: "boolean",
      default: true,
      order: 15,
    },
    outputAreaFontSize: {
      title: "Output area fontsize",
      description: "Change the fontsize of the Output area.",
      type: "integer",
      minimum: 0,
      default: 0,
      order: 16,
    },
    globalMode: {
      title: "Enable Global Kernel",
      description:
        "If enabled, all files of the same grammar will share a single global kernel (requires Atom restart)",
      type: "boolean",
      default: false,
      order: 17,
    },
    kernelNotifications: {
      title: "Enable Kernel Notifications",
      description:
        "Notify if kernels writes to stdout. By default, kernel notifications are only displayed in the developer console.",
      type: "boolean",
      default: false,
      order: 18,
    },
    startDir: {
      title: "Directory to start kernel in",
      description: "Restart the kernel for changes to take effect.",
      type: "string",
      enum: [
        {
          value: "firstProjectDir",
          description: "The first started project's directory (default)"
        },
        {
          value: "projectDirOfFile",
          description: "The project directory relative to the file"
        },
        {
          value: "dirOfFile",
          description: "Current directory of the file"
        }
      ],
      default: "dirOfFile",
      order: 19,
    },
    languageMappings: {
      title: "Language Mappings",
      description:
        'Custom Atom grammars and some kernels use non-standard language names. That leaves Hydrogen unable to figure out what kernel to start for your code. This field should be a valid JSON mapping from a kernel language name to Atom\'s grammar name ``` { "kernel name": "grammar name" } ```. For example ``` { "scala211": "scala", "javascript": "babel es6 javascript", "python": "magicpython" } ```.',
      type: "string",
      default: '{ "python": "magicpython" }',
      order: 20,
    },
    startupCode: {
      title: "Startup Code",
      description:
        'This code will be executed on kernel startup. Format: `{"kernel": "your code \\nmore code"}`. Example: `{"Python 2": "%matplotlib inline"}`',
      type: "string",
      default: "{}",
      order: 21,
    },
    gateways: {
      title: "Kernel Gateways",
      description:
        'hydrogen can connect to remote notebook servers and kernel gateways. Each gateway needs at minimum a name and a value for options.baseUrl. The options are passed directly to the `jupyter-js-services` npm package, which includes documentation for additional fields. Example value: ``` [{ "name": "Remote notebook", "options": { "baseUrl": "http://mysite.com:8888" } }] ```',
      type: "string",
      default: "[]",
      order: 22,
    },
  }
}
export default Config
