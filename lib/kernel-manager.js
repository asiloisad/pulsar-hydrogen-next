/** @babel */

import map from "lodash/map";
import mapKeys from "lodash/mapKeys";
import sortBy from "lodash/sortBy";
import { findAll as kernelSpecsFindAll } from "kernelspecs";
import { shell } from "electron";

import store from "./store";
import { getEditorDirectory, kernelSpecProvidesGrammar, log } from "./utils";

export class KernelManager {
  kernelSpecs = null;

  startKernelFor(grammar, editor, filePath, onStarted) {
    this.getKernelSpecForGrammar(grammar)
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

    const kernelResourcesDict = mapKeys(kernelSpecs, function (value, key) {
      return (value.spec.name = key);
    });
    this.kernelSpecs = sortBy(
      map(kernelResourcesDict, "spec"),
      (spec) => spec.display_name
    );
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
    return kernelSpecs.filter((spec) =>
      kernelSpecProvidesGrammar(spec, grammar)
    );
  }

  async getKernelSpecForGrammar(grammar) {
    const kernelSpecs = await this.getAllKernelSpecsForGrammar(grammar);

    if (kernelSpecs.length === 0) {
      return null;
    }

    if (
      kernelSpecs.length === 1 ||
      atom.config.get("hydrogen-next.autoKernelPicker")
    ) {
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
                shell.openExternal(
                  "https://nteract.gitbooks.io/hydrogen/docs/Installation.html"
                ),
            },
            {
              text: "Popular Kernels",
              onDidClick: () =>
                shell.openExternal("https://nteract.io/kernels"),
            },
            {
              text: "All Kernels",
              onDidClick: () =>
                shell.openExternal(
                  "https://github.com/jupyter/jupyter/wiki/Jupyter-kernels"
                ),
            },
          ],
        };
        atom.notifications.addError(message, options);
      } else {
        const message = "hydrogen kernels updated:";
        const displayNames = map(kernelSpecs, "display_name"); // kernelSpecs.map((kernelSpec) => kernelSpec.display_name)
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
