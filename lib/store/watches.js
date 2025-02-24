/** @babel */

import { CompositeDisposable } from "atom"
import { action, observable } from "mobx"
import SelectListView from "atom-select-list"
import WatchStore from "./watch"
import AutocompleteConsumer from "../services/consumed/autocomplete"
import { setPreviouslyFocusedElement } from "../utils"

export default class WatchesStore {
  @observable
  watches = []

  constructor(kernel) {
    this.kernel = kernel
    this.kernel.addWatchCallback(this.run)

    if (AutocompleteConsumer.isEnabled) {
      const disposable = new CompositeDisposable()
      this.autocompleteDisposables = disposable
      AutocompleteConsumer.register(disposable)
    }

    this.addWatch()
  }

  @action
  createWatch = () => {
    const lastWatch = this.watches[this.watches.length - 1]

    if (!lastWatch || lastWatch.getCode().trim() !== "") {
      const watch = new WatchStore(this.kernel)
      this.watches.push(watch)
      if (AutocompleteConsumer.isEnabled) {
        AutocompleteConsumer.addAutocompleteToWatch(this, watch)
      }
      return watch
    }

    return lastWatch
  }
  @action
  addWatch = () => {
    this.createWatch().focus()
  }
  @action
  addWatchFromEditor = editor => {
    if (!editor) {
      return
    }
    const watchText = editor.getSelectedText()

    if (!watchText) {
      this.addWatch()
    } else {
      const watch = this.createWatch()
      watch.setCode(watchText)
      watch.run()
    }
  }
  @action
  removeWatch = () => {
    const watches = this.watches
      .map((v, k) => ({
        name: v.getCode(),
        value: k
      }))
      .filter(obj => obj.value !== 0 || obj.name !== "")
    const watchesPicker = new SelectListView({
      items: watches,
      elementForItem: watch => {
        const element = document.createElement("li")
        element.textContent = watch.name || "<empty>"
        return element
      },
      didConfirmSelection: watch => {
        const selectedWatch = this.watches[watch.value]
        // This is for cleanup to improve performance
        if (AutocompleteConsumer.isEnabled) {
          AutocompleteConsumer.removeAutocompleteFromWatch(this, selectedWatch)
        }
        this.watches.splice(watch.value, 1)
        modalPanel.destroy()
        watchesPicker.destroy()
        if (this.watches.length === 0) {
          this.addWatch()
        } else if (this.previouslyFocusedElement) {
          this.previouslyFocusedElement.focus()
        }
      },
      filterKeyForItem: watch => watch.name,
      didCancelSelection: () => {
        modalPanel.destroy()
        if (this.previouslyFocusedElement) {
          this.previouslyFocusedElement.focus()
        }
        watchesPicker.destroy()
      },
      emptyMessage: "There are no watches to remove!"
    })
    setPreviouslyFocusedElement(this)
    const modalPanel = atom.workspace.addModalPanel({
      item: watchesPicker
    })
    watchesPicker.focus()
  }
  @action
  run = () => {
    this.watches.forEach(watch => watch.run())
  }

  destroy() {
    if (AutocompleteConsumer.isEnabled && this.autocompleteDisposables) {
      AutocompleteConsumer.dispose(this.autocompleteDisposables)
    }
  }
}
