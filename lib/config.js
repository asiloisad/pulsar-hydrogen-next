/** @babel */

const Config = {
  getJson(key, _default = {}) {
    const value = atom.config.get(`hydrogen-next.${key}`);
    if (!value || typeof value !== "string") {
      return _default;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      const message = `Your Hydrogen config is broken: ${key}`;
      atom.notifications.addError(message, {
        detail: error,
      });
    }

    return _default;
  },

  schema: {
    autocomplete: {
      order: 1,
      title: "Enable Autocomplete",
      description:
        "If enabled, use autocomplete options provided by the current kernel. This applies to both the main editor and watch pane editors.",
      type: "boolean",
      default: true,
    },
    autocompleteSuggestionPriority: {
      order: 2,
      title: "Autocomple Suggestion Priority",
      description:
        "Specify the sort order of Hydrogen's autocomplete suggestions. Note the default providers like snippets have priority of `1`.",
      type: "integer",
      default: 3,
    },
    showInspectorResultsInAutocomplete: {
      order: 3,
      title: "Enable Autocomplete description",
      description:
        "If enabled, Hydrogen will try to show [the results from kernel inspection](https://nteract.gitbooks.io/hydrogen/docs/Usage/GettingStarted.html#hydrogen-toggle-inspector) in each autocomplete suggestion's description. ⚠ May slow down the autocompletion performance. **Note**: Even if you disable this, you would still get autocomplete suggestions.",
      type: "boolean",
      default: false,
    },
    importNotebookURI: {
      order: 4,
      title: "Enable Notebook Auto-import",
      description:
        "If enabled, opening a file with extension `.ipynb` will [import the notebook](https://nteract.gitbooks.io/hydrogen/docs/Usage/NotebookFiles.html#notebook-import) file's source into a new tab. If disabled, or if the Hydrogen package is not activated, the raw file will open in Pulsar as normal.",
      type: "boolean",
      default: true,
    },
    importNotebookResults: {
      order: 5,
      title: "Enable Import of Notebook Results",
      description:
        "If enabled, anytime you import a notebook, the saved results are also rendered inline. If disabled, you can still import notebooks as normal.",
      type: "boolean",
      default: true,
    },
    statusBarDisable: {
      order: 6,
      title: "Disable the Hydrogen status bar",
      description:
        "If enabled, no kernel information will be provided in Pulsar's status bar.",
      type: "boolean",
      default: false,
    },
    statusBarKernelInfo: {
      order: 7,
      title: "Detailed kernel information in the Hydrogen status bar",
      description:
        "If enabled, more detailed kernel information (execution count, execution time if available) will be shown in the Hydrogen status bar. This requires the above **Disable the Hydrogen status bar** setting to be `false` to work.",
      type: "boolean",
      default: true,
    },
    autoKernelPicker: {
      order: 8,
      title: "Auto Kernel Picker",
      description: "Automatically select kernel if only kernel available.",
      type: "boolean",
      default: false,
    },
    debug: {
      order: 9,
      title: "Enable Debug Messages",
      description: "If enabled, log debug messages onto the dev console.",
      type: "boolean",
      default: false,
    },
    autoScroll: {
      order: 10,
      title: "Enable Autoscroll",
      description:
        "If enabled, Hydrogen will automatically scroll to the bottom of the result view.",
      type: "boolean",
      default: true,
    },
    scrollOnMoveDown: {
      order: 11,
      title: "Scroll Behavior on Move Down",
      description:
        "Controls scrolling behavior when running code and moving to the next line.",
      type: "string",
      enum: [
        {
          value: "none",
          description: "Don't scroll - cursor moves but view stays",
        },
        {
          value: "center",
          description: "Center scroll - always center cursor on screen",
        },
        {
          value: "halfWindow",
          description: "Scroll until half window - scroll only when cursor passes mid-screen",
        },
      ],
      default: "halfWindow",
    },
    wrapOutput: {
      order: 13,
      title: "Enable Soft Wrap for Output",
      description:
        "If enabled, your output code from Hydrogen will break long text and items.",
      type: "boolean",
      default: true,
    },
    outputAreaDefault: {
      order: 14,
      title: "View output in the dock by default",
      description:
        "If enabled, output will be displayed in the dock by default rather than inline.",
      type: "boolean",
      default: false,
    },
    outputAreaDock: {
      order: 15,
      title: "Leave output dock open",
      description:
        "Do not close dock when switching to an editor without a running kernel.",
      type: "boolean",
      default: true,
    },
    outputAreaFontSize: {
      order: 16,
      title: "Output area fontsize",
      description: "Change the fontsize of the Output area.",
      type: "integer",
      minimum: 0,
      default: 0,
    },
    globalMode: {
      order: 17,
      title: "Enable Global Kernel",
      description:
        "If enabled, all files of the same grammar will share a single global kernel (requires Pulsar restart).",
      type: "boolean",
      default: false,
    },
    kernelNotifications: {
      order: 18,
      title: "Enable Kernel Notifications",
      description:
        "Notify if kernels writes to stdout. By default, kernel notifications are only displayed in the developer console.",
      type: "boolean",
      default: false,
    },
    cellMarkers: {
      order: 19,
      title: "Create cell markers",
      description:
        "The cell marker decoration can be customised in `styles.less`. Requires reopening the editor after config change.",
      type: "boolean",
      default: false,
    },
    startDir: {
      order: 20,
      title: "Directory to start kernel in",
      description: "Restart the kernel for changes to take effect.",
      type: "string",
      enum: [
        {
          value: "firstProjectDir",
          description: "The first started project's directory",
        },
        {
          value: "projectDirOfFile",
          description: "The project directory relative to the file",
        },
        {
          value: "dirOfFile",
          description: "Current directory of the file",
        },
      ],
      default: "dirOfFile",
    },
    languageMappings: {
      order: 21,
      title: "Language Mappings",
      description:
        'Custom Pulsar grammars and some kernels use non-standard language names. That leaves Hydrogen unable to figure out what kernel to start for your code. This field should be a valid JSON mapping from a kernel language name to Pulsar\'s grammar name ``` { "kernel name": "grammar name" } ```. For example ``` { "scala211": "scala", "javascript": "babel es6 javascript", "python": "magicpython" } ```.',
      type: "string",
      default: '{ "python": "magicpython" }',
    },
    startupCodePerLanguage: {
      order: 22,
      title: "Startup Code per Language",
      description:
        'Code executed on kernel startup, matched by language name. Runs before kernel-specific code. Format: `{"language": "your code \\nmore code"}`. Example: `{"python": "%matplotlib inline", "javascript": "console.log(\'ready\')"}`.',
      type: "string",
      default: "{}",
    },
    startupCodePerKernel: {
      order: 23,
      title: "Startup Code per Kernel",
      description:
        'Code executed on kernel startup, matched by kernel display name. Format: `{"kernel": "your code \\nmore code"}`. Example: `{"Python 3": "%matplotlib inline"}`.',
      type: "string",
      default: "{}",
    },
    gateways: {
      order: 24,
      title: "Kernel Gateways",
      description:
        'hydrogen can connect to remote notebook servers and kernel gateways. Each gateway needs at minimum a name and a value for options.baseUrl. The options are passed directly to the `jupyter-js-services` npm package, which includes documentation for additional fields. Example value: ``` [{ "name": "Remote notebook", "options": { "baseUrl": "http://mysite.com:8888" } }].```',
      type: "string",
      default: "[]",
    },
    scrollMapState: {
      order: 25,
      type: "boolean",
      title: "Scroll Map",
      description: "Display cell breakpoint markers on scroll bar.",
      default: true,
    },
    pythonKernelAutoReload: {
      order: 26,
      title: "Python autoreload extension options",
      description: "Whether or not to load the autocomplete extension on the launch of any ipython kernel (requires kernel restart)",
      type: "string",
      enum: [
        {
          value: "all",
          description: "All modules",
        },
        {
          value: "explicit",
          description: "Explicit, only for modules imported with magic %aimport",
        },
        {
          value: "off",
          description: "Off",
        },
      ],
      default: "all",
    },
    pythonKernelAutoReloadPrint: {
      order: 27,
      title: "Display autoreload activity",
      description: "If true autoreload activity will be printed, disable to hide (requires kernel restart)",
      type: "boolean",
      default: true,
    },
  },
};
export default Config;
