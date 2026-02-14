/** @babel */

import naturalCompare from "natural-compare-lite";
import { findAll as kernelSpecsFindAll } from "kernelspecs";
import { shell } from "electron";

import store from "./store";
import { getEditorDirectory, kernelSpecProvidesGrammar, log } from "./utils";
import { escapeStringRegexp, getCommentStartString } from "./code-manager";

export class KernelManager {
  kernelSpecs = null;

  startKernelFor(grammar, editor, filePath, onStarted) {
    this.getKernelSpecForGrammar(grammar, editor)
      .then((kernelSpec) => {
        if (!kernelSpec) {
          const message = `No kernel for grammar \`${grammar.name}\` found`;
          const pythonDescription =
            grammar && /python/g.test(grammar.scopeName)
              ? "\n\nTo detect your current Python install you will need to run:<pre>python -m pip install ipykernel\npython -m ipykernel install --user</pre>"
              : "";
          const description = `Check that the language for this file is set in Pulsar, that you have a Jupyter kernel installed for it, and that you have configured the language mapping in Hydrogen preferences.${pythonDescription}`;
          atom.notifications.addError(message, {
            description,
            dismissable: pythonDescription !== "",
          });
          return;
        }

        this.startKernel(kernelSpec, grammar, editor, filePath, onStarted);
      })
      .catch((error) => {
        log("KernelManager: Error starting kernel:", error);
        atom.notifications.addError("Failed to start kernel", {
          description: error.message || String(error),
          dismissable: true,
        });
      });
  }

  startKernel(kernelSpec, grammar, editor, filePath, onStarted) {
    const displayName = kernelSpec.display_name;
    // if kernel startup already in progress don't start additional kernel
    if (store.startingKernels.get(displayName)) {
      return;
    }
    store.startKernel(displayName);
    const currentPath = getEditorDirectory(editor);
    let projectPath;
    log("KernelManager: startKernel:", displayName);

    switch (atom.config.get("hydrogen-next.startDir")) {
      case "firstProjectDir":
        projectPath = atom.project.getPaths()[0];
        break;

      case "projectDirOfFile":
        projectPath = atom.project.relativizePath(currentPath)[0];
        break;
    }

    const kernelStartDir = projectPath != null ? projectPath : currentPath;
    const options = {
      cwd: kernelStartDir,
      stdio: ["ignore", "pipe", "pipe"],
    };
    const ZMQKernel = require("./zmq-kernel");
    const transport = new ZMQKernel(kernelSpec, grammar, options, () => {
      const Kernel = require("./kernel");
      const kernel = new Kernel(transport);
      store.newKernel(kernel, filePath, editor, grammar);
      if (onStarted) {
        onStarted(kernel);
      }
    });
  }

  async update() {
    const kernelSpecs = await kernelSpecsFindAll();

    this.kernelSpecs = Object.entries(kernelSpecs)
      .map(([name, { spec }]) => {
        spec.name = name;
        return spec;
      })
      .sort((a, b) => naturalCompare(a.display_name, b.display_name));
    return this.kernelSpecs;
  }

  async getAllKernelSpecs(grammar) {
    if (this.kernelSpecs) {
      return this.kernelSpecs;
    }
    return this.updateKernelSpecs(grammar, true);
  }

  async getAllKernelSpecsForGrammar(grammar) {
    if (!grammar) {
      return [];
    }
    const kernelSpecs = await this.getAllKernelSpecs(grammar);
    return kernelSpecs.filter((spec) => kernelSpecProvidesGrammar(spec, grammar));
  }

  async getKernelSpecForGrammar(grammar, editor) {
    const kernelSpecs = await this.getAllKernelSpecsForGrammar(grammar);

    if (kernelSpecs.length === 0) {
      return null;
    }

    // Check for magic comment "<comment>:: kernelname" in first line
    if (editor) {
      const kernelFromComment = this._getKernelFromMagicComment(editor, kernelSpecs);
      if (kernelFromComment) {
        return kernelFromComment;
      }
    }

    if (kernelSpecs.length === 1 && atom.config.get("hydrogen-next.autoKernelPicker")) {
      return kernelSpecs[0];
    }

    if (this.kernelPicker) {
      this.kernelPicker.kernelSpecs = kernelSpecs;
    } else {
      const KernelPicker = require("./kernel-picker");
      this.kernelPicker = new KernelPicker(kernelSpecs);
    }

    return new Promise((resolve) => {
      if (!this.kernelPicker) {
        return resolve(null);
      }

      this.kernelPicker.onConfirmed = (kernelSpec) => resolve(kernelSpec);

      this.kernelPicker.toggle();
    });
  }

  /**
   * Check for magic comment "<comment>:: kernelname" in first line of editor.
   * Uses the editor's language-specific comment character.
   * Returns matching kernel spec or null.
   */
  _getKernelFromMagicComment(editor, kernelSpecs) {
    const firstLine = editor.lineTextForBufferRow(0);
    if (!firstLine) {
      return null;
    }

    // Get the comment start string for the current language
    const commentStart = getCommentStartString(editor);
    if (!commentStart) {
      return null;
    }

    // Match "<comment>:: kernelname" pattern
    const escapedComment = escapeStringRegexp(commentStart);
    const regex = new RegExp(`^${escapedComment}::\\s*(.+)`);
    const match = firstLine.match(regex);
    if (!match) {
      return null;
    }

    const requestedKernel = match[1].trim();
    log("KernelManager: Magic comment kernel requested:", requestedKernel);

    // Try exact match on kernel name first, then display_name (case-sensitive)
    const found = kernelSpecs.find(
      (spec) => spec.name === requestedKernel || spec.display_name === requestedKernel,
    );

    if (found) {
      log("KernelManager: Magic comment matched kernel:", found.display_name);
      return found;
    }

    log("KernelManager: Magic comment kernel not found:", requestedKernel);
    return null;
  }

  async updateKernelSpecs(grammar, silent) {
    const kernelSpecs = await this.update();

    if (!silent) {
      if (kernelSpecs.length === 0) {
        const message = "No Kernels Installed";
        const options = {
          description:
            "No kernels are installed on your system so you will not be able to execute code in any language.",
          dismissable: true,
          buttons: [
            {
              text: "Install Instructions",
              onDidClick: () =>
                shell.openExternal("https://nteract.gitbooks.io/hydrogen/docs/Installation.html"),
            },
            {
              text: "Popular Kernels",
              onDidClick: () => shell.openExternal("https://nteract.io/kernels"),
            },
            {
              text: "All Kernels",
              onDidClick: () =>
                shell.openExternal("https://github.com/jupyter/jupyter/wiki/Jupyter-kernels"),
            },
          ],
        };
        atom.notifications.addError(message, options);
      } else {
        const message = "hydrogen kernels updated:";
        const displayNames = kernelSpecs.map((spec) => spec.display_name);
        const options = {
          detail: displayNames.join("\n"),
        };
        atom.notifications.addInfo(message, options);
      }
    }

    return kernelSpecs;
  }
}

// used in the tests
if (atom.inSpecMode()) {
  exports.ks = require("kernelspecs");
}
