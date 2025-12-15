/** @babel */

import SelectListView, { highlightMatches } from "pulsar-select-list";
import filter from "lodash/filter";
import isEmpty from "lodash/isEmpty";
import { v4 as uuidv4 } from "uuid";
import ws from "ws";
import { XMLHttpRequest as NodeXMLHttpRequest } from "xmlhttprequest";
import { URL } from "url";
import path from "path";
import {
  KernelAPI,
  SessionAPI,
  KernelSpecAPI,
  KernelManager,
  KernelSpecManager,
  SessionManager,
  ServerConnection,
} from "@jupyterlab/services";
import Config from "./config";
import WSKernel from "./ws-kernel";
import InputView from "./input-view";
import store from "./store";
import { setPreviouslyFocusedElement, tildify } from "./utils";

class CustomListView {
  onConfirmed = null;
  onCancelled = null;

  constructor() {
    this.selectList = new SelectListView({
      itemsClassList: ["mark-active"],

      items: [],

      className: "hydrogen-next ws-kernel-picker",

      filterKeyForItem: (item) => item.name,

      willShow: () => {
        setPreviouslyFocusedElement(this);
      },

      elementForItem: (item, options) => {
        const element = document.createElement("li");
        const matches = this.selectList.getMatchIndices(item) || [];
        element.appendChild(highlightMatches(item.name, matches));
        return element;
      },

      didConfirmSelection: (item) => {
        if (this.onConfirmed) {
          this.onConfirmed(item);
        }
      },

      didCancelSelection: () => {
        this.cancel();
        if (this.onCancelled) {
          this.onCancelled();
        }
      },
    });
  }

  show() {
    if (!this.panel) {
      this.panel = atom.workspace.addModalPanel({
        item: this.selectList,
      });
    }

    this.panel.show();
    this.selectList.focus();
  }

  destroy() {
    this.cancel();
    return this.selectList.destroy();
  }

  cancel() {
    if (this.panel != null) {
      this.panel.destroy();
    }

    this.panel = null;

    if (this.previouslyFocusedElement) {
      this.previouslyFocusedElement.focus();
      this.previouslyFocusedElement = null;
    }
  }
}

export default class WSKernelPicker {
  constructor(onChosen) {
    this._onChosen = onChosen;
    this.listView = new CustomListView();
  }

  async toggle(_kernelSpecFilter) {
    setPreviouslyFocusedElement(this.listView);
    this._kernelSpecFilter = _kernelSpecFilter;
    const gateways = Config.getJson("gateways") || [];

    if (isEmpty(gateways)) {
      atom.notifications.addError("No remote kernel gateways available", {
        description:
          "Use the Hydrogen package settings to specify the list of remote servers. Hydrogen can use remote kernels on either a Jupyter Kernel Gateway or Jupyter notebook server.",
      });
      return;
    }

    // Use only filename for Jupyter API (requires relative path, not absolute)
    const fileName = store.filePath ? path.basename(store.filePath) : "unsaved";
    this._path = `${fileName}-${uuidv4()}`;
    this.listView.onConfirmed = this.onGateway.bind(this);
    await this.listView.selectListView.update({
      items: gateways,
      infoMessage: "Select a gateway",
      emptyMessage: "No gateways available",
      loadingMessage: null,
    });
    this.listView.show();
  }

  async promptForText(prompt, { password = false } = {}) {
    const previouslyFocusedElement = this.listView.previouslyFocusedElement;
    this.listView.cancel();

    const inputPromise = new Promise((resolve, reject) => {
      const inputView = new InputView(
        { prompt, allowCancel: true, password },
        resolve, // onConfirmed
        () => reject(new Error("Input cancelled")) // onCancelled
      );
      inputView.attach();
    });

    try {
      const response = await inputPromise;
      if (response === "") {
        return null;
      }
      this.listView.show();
      this.listView.previouslyFocusedElement = previouslyFocusedElement;
      return response;
    } catch (e) {
      // Better error handling (from PR #9)
      if (e.message !== "Input cancelled") {
        console.error("[WSKernelPicker] promptForText error:", e);
        atom.notifications.addError("Error while prompting for input", {
          detail: e.stack || String(e),
          dismissable: true,
        });
      }
      return null;
    }
  }

  async promptForCookie(options) {
    const cookie = await this.promptForText("Cookie:", { password: true });
    if (!cookie) {
      atom.notifications.addInfo("Cookie authentication cancelled");
      return false;
    }

    if (!options.requestHeaders) {
      options.requestHeaders = {};
    }

    options.requestHeaders.Cookie = cookie;

    options.xhrFactory = () => {
      const request = new NodeXMLHttpRequest();
      request.setDisableHeaderCheck(true);
      return request;
    };

    options.wsFactory = (url, protocol) => {
      const parsedUrl = new URL(url);
      parsedUrl.protocol = parsedUrl.protocol === "wss:" ? "https:" : "http:";
      return new ws(url, protocol, {
        headers: { Cookie: cookie },
        origin: parsedUrl.origin,
        host: parsedUrl.host,
      });
    };

    return true;
  }

  async promptForToken(options) {
    const token = await this.promptForText("Token:", { password: true });
    if (token === null) {
      atom.notifications.addInfo("Token authentication cancelled");
      return false;
    }
    options.token = token;
    return true;
  }

  async promptForCredentials(options) {
    await this.listView.selectListView.update({
      items: [
        { name: "Authenticate with a token", action: "token" },
        { name: "Authenticate with a cookie", action: "cookie" },
      ],
      infoMessage:
        "You may need to authenticate to complete the connection, or your settings may be incorrect, or the server may be unavailable.",
      loadingMessage: null,
      emptyMessage: null,
    });

    const action = await new Promise((resolve) => {
      this.listView.onConfirmed = (item) => resolve(item.action);
      this.listView.onCancelled = () => resolve("cancel");
    });

    if (action === "token") return this.promptForToken(options);
    if (action === "cookie") return this.promptForCookie(options);

    this.listView.cancel();
    return false;
  }

  async onGateway(gatewayInfo) {
    this.listView.onConfirmed = null;
    await this.listView.selectListView.update({
      items: [],
      loadingMessage: "Loading sessions\u2026",
      emptyMessage: "No sessions available",
    });

    // Spread gateway config first, then override with our factories
    const gatewayOptions = {
      ...gatewayInfo.options,
    };

    // Custom factories that handle auth - must be after spread to not be overridden
    gatewayOptions.xhrFactory = () => new XMLHttpRequest();
    gatewayOptions.wsFactory = (url, protocol) => {
      // Append token to WebSocket URL if available (required for auth)
      if (gatewayOptions.token) {
        const urlObj = new URL(url);
        urlObj.searchParams.set("token", gatewayOptions.token);
        url = urlObj.toString();
      }
      return new ws(url, protocol);
    };

    let serverSettings = ServerConnection.makeSettings(gatewayOptions);
    let specModels;

    try {
      specModels = await KernelSpecAPI.getSpecs(serverSettings);
    } catch (error) {
      // Handle connection timeout
      const errorMessage = error.message || error.xhr?.responseText || "";
      if (
        errorMessage.includes("ETIMEDOUT") ||
        errorMessage.includes("ECONNREFUSED")
      ) {
        atom.notifications.addError("Connection to gateway failed", {
          detail: errorMessage,
        });
        this.listView.cancel();
        return;
      }

      // Handle 403 Forbidden or other auth errors - prompt for credentials
      const status = error.response?.status || error.xhr?.status;
      if (
        status === 403 ||
        status === 401 ||
        errorMessage.includes("Forbidden")
      ) {
        const promptSucceeded = await this.promptForCredentials(gatewayOptions);
        if (!promptSucceeded) return;

        serverSettings = ServerConnection.makeSettings(gatewayOptions);
        await this.listView.selectListView.update({
          items: [],
          loadingMessage: "Loading sessions\u2026",
          emptyMessage: "No sessions available",
        });
      } else {
        // Unknown error - show it to user
        atom.notifications.addError("Connection to gateway failed", {
          detail: error.message || String(error),
          dismissable: true,
        });
        this.listView.cancel();
        return;
      }
    }

    try {
      if (!specModels) {
        specModels = await KernelSpecAPI.getSpecs(serverSettings);
      }

      const kernelSpecs = filter(specModels.kernelspecs, (spec) =>
        this._kernelSpecFilter(spec)
      );

      if (kernelSpecs.length === 0) {
        this.listView.cancel();
        atom.notifications.addError(
          "There are no kernels that match the grammar of the currently open file."
        );
        return;
      }

      const kernelNames = kernelSpecs.map((specModel) => specModel.name);

      try {
        let sessionModels = await SessionAPI.listRunning(serverSettings);
        // Note: 0 sessions is normal for a fresh server - don't re-prompt for auth

        sessionModels = sessionModels.filter((model) => {
          const name = model.kernel ? model.kernel.name : null;
          return name ? kernelNames.includes(name) : true;
        });

        const items = sessionModels.map((model) => {
          const name = model.path
            ? tildify(model.path)
            : model.notebook?.path
            ? tildify(model.notebook.path)
            : `Session ${model.id}`;

          return {
            name,
            model,
            options: serverSettings,
          };
        });

        items.unshift({
          name: "[new session]",
          model: null,
          options: serverSettings,
          kernelSpecs,
        });

        this.listView.onConfirmed = this.onSession.bind(this, gatewayInfo.name);
        await this.listView.selectListView.update({
          items,
          loadingMessage: null,
        });
      } catch (error) {
        // Handle 403 for session listing - prompt for auth if needed
        const status = error.response?.status || error.xhr?.status;
        if (status === 403 || status === 401) {
          const promptSucceeded = await this.promptForCredentials(
            gatewayOptions
          );
          if (!promptSucceeded) return;

          serverSettings = ServerConnection.makeSettings(gatewayOptions);
          // Retry with authenticated settings
          this.onSession(gatewayInfo.name, {
            name: "[new session]",
            model: null,
            options: serverSettings,
            kernelSpecs,
          });
        } else {
          throw error;
        }
      }
    } catch (e) {
      atom.notifications.addError("Connection to gateway failed", {
        detail: e.message,
      });
      this.listView.cancel();
    }
  }

  onSession(gatewayName, sessionInfo) {
    const model = sessionInfo.model;
    return model
      ? this.onSessionWithModel(gatewayName, sessionInfo)
      : this.onSessionWitouthModel(gatewayName, sessionInfo);
  }

  async onSessionWithModel(gatewayName, sessionInfo) {
    const kernelManager = new KernelManager({
      serverSettings: sessionInfo.options,
    });
    const sessionManager = new SessionManager({
      serverSettings: sessionInfo.options,
      kernelManager,
    });

    const model2 = await sessionInfo.model;
    await sessionManager.refreshRunning();
    const session = sessionManager.connectTo({
      serverSettings: sessionInfo.options,
      model: model2,
    });

    this.onSessionChosen(gatewayName, session, {
      sessionManager,
      kernelManager,
    });
  }

  async onSessionWitouthModel(gatewayName, sessionInfo) {
    if (!sessionInfo.name) {
      await this.listView.selectListView.update({
        items: [],
        errorMessage: "This gateway does not support listing sessions",
      });
    }

    const items = sessionInfo.kernelSpecs.map((spec) => ({
      name: spec.display_name,
      options: {
        serverSettings: sessionInfo.options,
        kernelName: spec.name,
        path: this._path,
      },
    }));

    this.listView.onConfirmed = this.startSession.bind(this, gatewayName);
    await this.listView.selectListView.update({
      items,
      emptyMessage: "No kernel specs available",
      infoMessage: "Select a session",
    });
  }

  async startSession(gatewayName, sessionInfo) {
    const kernelManager = new KernelManager({
      serverSettings: sessionInfo.options.serverSettings,
    });
    const sessionManager = new SessionManager({
      serverSettings: sessionInfo.options.serverSettings,
      kernelManager,
    });

    const model = await SessionAPI.startSession(
      {
        ...sessionInfo.options,
        type: "notebook",
        name: "none",
        kernel: {
          name: sessionInfo.options.kernelName,
        },
        path: sessionInfo.options.path,
      },
      sessionInfo.options.serverSettings
    );

    await sessionManager.refreshRunning();
    const session = sessionManager.connectTo({ model });

    this.onSessionChosen(gatewayName, session, {
      sessionManager,
      kernelManager,
    });
  }

  async onSessionChosen(gatewayName, session, managers = {}) {
    this.listView.cancel();
    await session.kernel.ready;
    const kernelSpec = await session.kernel.spec;
    if (!store.grammar) return;

    const kernel = new WSKernel(
      gatewayName,
      kernelSpec,
      store.grammar,
      session,
      managers
    );
    this._onChosen(kernel);
  }
}
