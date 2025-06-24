/** @babel */

import SelectListView from "atom-select-list"
import filter from "lodash/filter"
import isEmpty from "lodash/isEmpty"
import tildify from "tildify-commonjs"
import { v4 } from "uuid"
import ws from "ws"
import { XMLHttpRequest as NodeXMLHttpRequest } from "xmlhttprequest"
import { URL } from "url"
import {
  KernelAPI,
  SessionAPI,
  KernelSpecAPI,
  KernelManager,
  KernelSpecManager,
  SessionManager,
  ServerConnection
} from "@jupyterlab/services"
import Config from "./config"
import WSKernel from "./ws-kernel"
import InputView from "./input-view"
import store from "./store"
import { setPreviouslyFocusedElement } from "./utils"

class CustomListView {
  onConfirmed = null
  onCancelled = null

  constructor() {
    setPreviouslyFocusedElement(this)
    this.selectListView = new SelectListView({
      itemsClassList: ["mark-active"],
      items: [],
      filterKeyForItem: item => item.name,
      elementForItem: item => {
        const element = document.createElement("li")
        element.textContent = item.name
        return element
      },
      didConfirmSelection: item => {
        if (this.onConfirmed) {
          this.onConfirmed(item)
        }
      },
      didCancelSelection: () => {
        this.cancel()
        if (this.onCancelled) {
          this.onCancelled()
        }
      }
    })
  }

  show() {
    if (!this.panel) {
      this.panel = atom.workspace.addModalPanel({
        item: this.selectListView
      })
    }

    this.panel.show()
    this.selectListView.focus()
  }

  destroy() {
    this.cancel()
    return this.selectListView.destroy()
  }

  cancel() {
    if (this.panel != null) {
      this.panel.destroy()
    }

    this.panel = null

    if (this.previouslyFocusedElement) {
      this.previouslyFocusedElement.focus()
      this.previouslyFocusedElement = null
    }
  }
}

export default class WSKernelPicker {
  constructor(onChosen) {
    this._onChosen = onChosen
    this.listView = new CustomListView()
  }

  async toggle(_kernelSpecFilter) {
    setPreviouslyFocusedElement(this.listView)
    this._kernelSpecFilter = _kernelSpecFilter
    const gateways = Config.getJson("gateways") || []

    if (isEmpty(gateways)) {
      atom.notifications.addError("No remote kernel gateways available", {
        description: "Use the Hydrogen package settings to specify the list of remote servers. Hydrogen can use remote kernels on either a Jupyter Kernel Gateway or Jupyter notebook server."
      })
      return
    }

    this._path = `${store.filePath || "unsaved"}-${v4()}`
    this.listView.onConfirmed = this.onGateway.bind(this)
    await this.listView.selectListView.update({
      items: gateways,
      infoMessage: "Select a gateway",
      emptyMessage: "No gateways available",
      loadingMessage: undefined
    })
    this.listView.show()
  }

  async promptForText(prompt) {
    const previouslyFocusedElement = this.listView.previouslyFocusedElement
    this.listView.cancel()

    const inputPromise = new Promise((resolve, reject) => {
      const inputView = new InputView({ prompt }, resolve)
      atom.commands.add(inputView.element, {
        "core:cancel": () => {
          inputView.close()
          reject()
        }
      })
      inputView.attach()
    })

    try {
      const response = await inputPromise
      if (response === "") {
        return null
      }
      this.listView.show()
      this.listView.previouslyFocusedElement = previouslyFocusedElement
      return response
    } catch {
      return null
    }
  }

  async promptForCookie(options) {
    const cookie = await this.promptForText("Cookie:")
    if (!cookie) return false

    if (!options.requestHeaders) {
      options.requestHeaders = {}
    }

    options.requestHeaders.Cookie = cookie

    options.xhrFactory = () => {
      const request = new NodeXMLHttpRequest()
      request.setDisableHeaderCheck(true)
      return request
    }

    options.wsFactory = (url, protocol) => {
      const parsedUrl = new URL(url)
      parsedUrl.protocol = parsedUrl.protocol === "wss:" ? "https:" : "http:"
      return new ws(url, protocol, {
        headers: { Cookie: cookie },
        origin: parsedUrl.origin,
        host: parsedUrl.host
      })
    }

    return true
  }

  async promptForToken(options) {
    const token = await this.promptForText("Token:")
    if (token === null) return false
    options.token = token
    return true
  }

  async promptForCredentials(options) {
    await this.listView.selectListView.update({
      items: [
        { name: "Authenticate with a token", action: "token" },
        { name: "Authenticate with a cookie", action: "cookie" },
        { name: "Cancel", action: "cancel" }
      ],
      infoMessage: "You may need to authenticate to complete the connection, or your settings may be incorrect, or the server may be unavailable.",
      loadingMessage: null,
      emptyMessage: null
    })

    const action = await new Promise(resolve => {
      this.listView.onConfirmed = item => resolve(item.action)
      this.listView.onCancelled = () => resolve("cancel")
    })

    if (action === "token") return this.promptForToken(options)
    if (action === "cookie") return this.promptForCookie(options)

    this.listView.cancel()
    return false
  }

  async onGateway(gatewayInfo) {
    this.listView.onConfirmed = null
    await this.listView.selectListView.update({
      items: [],
      loadingMessage: "Loading sessions...",
      emptyMessage: "No sessions available"
    })

    const gatewayOptions = {
      xhrFactory: () => new XMLHttpRequest(),
      wsFactory: (url, protocol) => new ws(url, protocol),
      ...gatewayInfo.options
    }

    let serverSettings = ServerConnection.makeSettings(gatewayOptions)
    let specModels

    try {
      specModels = await KernelSpecAPI.getSpecs(serverSettings)
    } catch (error) {
      if (!error.xhr || !error.xhr.responseText) throw error
      if (error.xhr.responseText.includes("ETIMEDOUT")) {
        atom.notifications.addError("Connection to gateway failed")
        this.listView.cancel()
        return
      } else {
        const promptSucceeded = await this.promptForCredentials(gatewayOptions)
        if (!promptSucceeded) return

        serverSettings = ServerConnection.makeSettings(gatewayOptions)
        await this.listView.selectListView.update({
          items: [],
          loadingMessage: "Loading sessions...",
          emptyMessage: "No sessions available"
        })
      }
    }

    try {
      if (!specModels) {
        specModels = await KernelSpecAPI.getSpecs(serverSettings)
      }

      const kernelSpecs = filter(specModels.kernelspecs, spec =>
        this._kernelSpecFilter(spec)
      )

      if (kernelSpecs.length === 0) {
        this.listView.cancel()
        atom.notifications.addError("There are no kernels that match the grammar of the currently open file.")
        return
      }

      const kernelNames = kernelSpecs.map(specModel => specModel.name)

      try {
        let sessionModels = await SessionAPI.listRunning(serverSettings)
        if (sessionModels.length === 0) {
          await this.promptForCredentials(gatewayOptions)
          serverSettings = ServerConnection.makeSettings(gatewayOptions)
          sessionModels = await SessionAPI.listRunning(serverSettings)
        }

        sessionModels = sessionModels.filter(model => {
          const name = model.kernel ? model.kernel.name : null
          return name ? kernelNames.includes(name) : true
        })

        const items = sessionModels.map(model => {
          const name = model.path ? tildify(model.path) :
            model.notebook?.path ? tildify(model.notebook.path) :
            `Session ${model.id}`

          return {
            name,
            model,
            options: serverSettings
          }
        })

        items.unshift({
          name: "[new session]",
          model: null,
          options: serverSettings,
          kernelSpecs
        })

        this.listView.onConfirmed = this.onSession.bind(this, gatewayInfo.name)
        await this.listView.selectListView.update({
          items,
          loadingMessage: null
        })

      } catch (error) {
        if (!error.xhr || error.xhr.status !== 403) {
          throw error
        }
        this.onSession(gatewayInfo.name, {
          name: "[new session]",
          model: null,
          options: serverSettings,
          kernelSpecs
        })
      }
    } catch (e) {
      atom.notifications.addError("Connection to gateway failed", {
        detail: e.message
      })
      this.listView.cancel()
    }
  }

  onSession(gatewayName, sessionInfo) {
    const model = sessionInfo.model
    return model ? this.onSessionWithModel(gatewayName, sessionInfo) : this.onSessionWitouthModel(gatewayName, sessionInfo)
  }

  async onSessionWithModel(gatewayName, sessionInfo) {
    const kernelManager = new KernelManager({ serverSettings: sessionInfo.options })
    const sessionManager = new SessionManager({
      serverSettings: sessionInfo.options,
      kernelManager
    })

    const model2 = await sessionInfo.model
    await sessionManager.refreshRunning()
    const session = sessionManager.connectTo({ serverSettings: sessionInfo.options, model: model2 })

    this.onSessionChosen(gatewayName, session)
  }

  async onSessionWitouthModel(gatewayName, sessionInfo) {
    if (!sessionInfo.name) {
      await this.listView.selectListView.update({
        items: [],
        errorMessage: "This gateway does not support listing sessions"
      })
    }

    const items = sessionInfo.kernelSpecs.map(spec => ({
      name: spec.display_name,
      options: {
        serverSettings: sessionInfo.options,
        kernelName: spec.name,
        path: this._path
      }
    }))

    this.listView.onConfirmed = this.startSession.bind(this, gatewayName)
    await this.listView.selectListView.update({
      items,
      emptyMessage: "No kernel specs available",
      infoMessage: "Select a session"
    })
  }

  async startSession(gatewayName, sessionInfo) {
    const kernelManager = new KernelManager({ serverSettings: sessionInfo.options.serverSettings })
    const sessionManager = new SessionManager({
      serverSettings: sessionInfo.options.serverSettings,
      kernelManager
    })

    const model = await SessionAPI.startSession({
      ...sessionInfo.options,
      type: 'notebook',
      name: 'none',
      kernel: {
        name: sessionInfo.options.kernelName
      },
      path: sessionInfo.options.path
    }, sessionInfo.options.serverSettings)

    await sessionManager.refreshRunning()
    const session = sessionManager.connectTo({ model })

    this.onSessionChosen(gatewayName, session)
  }

  async onSessionChosen(gatewayName, session) {
    this.listView.cancel()
    await session.kernel.ready
    const kernelSpec = await session.kernel.spec
    if (!store.grammar) return

    const kernel = new WSKernel(gatewayName, kernelSpec, store.grammar, session)
    this._onChosen(kernel)
  }
}
