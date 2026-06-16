/** @babel */

import store from "./store";

function buildJupyterCommand() {
  const kernel = store.kernel;
  if (!kernel) {
    atom.notifications.addError("hydrogen-next", {
      description: "No running kernel for the active editor.",
      dismissable: true,
    });
    return null;
  }

  const connectionFile = kernel.transport && kernel.transport.connectionFile;
  if (!connectionFile) {
    atom.notifications.addError("hydrogen-next", {
      description:
        "Active kernel has no local connection file. Console launch is only supported for local kernels.",
      dismissable: true,
    });
    return null;
  }

  let template =
    atom.config.get("hydrogen-next.jupyterCommand") ||
    '"{python}" -m jupyter_console --existing {connection-file}';

  // Resolve {python} to the kernel's own interpreter (kernelSpec.argv[0]) so
  // the console connects without the env being activated in the terminal. Fall
  // back to `python` from PATH when no local interpreter path is available.
  if (template.includes("{python}")) {
    const python =
      (kernel.kernelSpec && kernel.kernelSpec.argv && kernel.kernelSpec.argv[0]) || "python";
    template = template.split("{python}").join(python);
  }

  const quotedPath = `"${connectionFile}"`;
  if (template.includes("{connection-file}")) {
    return template.split("{connection-file}").join(quotedPath);
  }
  return `${template} ${quotedPath}`;
}

export async function openJupyterConsole(terminalService) {
  if (!terminalService) {
    atom.notifications.addError("hydrogen-next", {
      description: "No terminal service available. Install the `terminal` package.",
      dismissable: true,
    });
    return;
  }

  const command = buildJupyterCommand();
  if (!command) return;

  await terminalService.run([command]);
}

export function copyJupyterConsoleCommand() {
  const command = buildJupyterCommand();
  if (!command) return;

  atom.clipboard.write(command);
  atom.notifications.addSuccess("hydrogen-next", {
    description: "Jupyter console command copied to clipboard.",
    detail: command,
  });
}

export function spawnJupyterConsole(terminalSpawnService) {
  if (!terminalSpawnService) {
    atom.notifications.addError("hydrogen-next", {
      description: "No terminal-spawn service available. Install the `terminal-spawn` package.",
      dismissable: true,
    });
    return;
  }

  const command = buildJupyterCommand();
  if (!command) return;

  terminalSpawnService.open(store.filePath, command);
}
