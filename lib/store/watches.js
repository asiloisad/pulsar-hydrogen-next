/** @babel */

import { CompositeDisposable } from "atom";
import { action, observable, makeObservable } from "mobx";
import WatchStore from "./watch";
import AutocompleteConsumer from "../services/consumed/autocomplete";

export default class WatchesStore {
  watches = [];

  constructor(kernel) {
    makeObservable(this, {
      watches: observable,
      createWatch: action,
      addWatch: action,
      addWatchFromEditor: action,
      removeWatchByRef: action,
      run: action,
    });

    this.kernel = kernel;
    this.kernel.addWatchCallback(this.run);

    // Setup autocomplete disposables for this watchesStore
    this.autocompleteDisposables = new CompositeDisposable();
    AutocompleteConsumer.register(this.autocompleteDisposables);
    // Start with zero watches - user can add them as needed
  }

  createWatch = () => {
    const lastWatch = this.watches[this.watches.length - 1];

    if (!lastWatch || lastWatch.getCode().trim() !== "") {
      const watch = new WatchStore(this.kernel);
      this.watches.push(watch);
      AutocompleteConsumer.addAutocompleteToWatch(this, watch);
      return watch;
    }

    return lastWatch;
  };

  addWatch = () => {
    this.createWatch().focus();
  };

  addWatchFromEditor = (editor) => {
    if (!editor) {
      return;
    }
    const watchText = editor.getSelectedText();

    if (!watchText) {
      this.addWatch();
    } else {
      const watch = this.createWatch();
      watch.setCode(watchText);
      watch.run();
    }
  };

  /**
   * Remove a specific watch by reference
   * @param {WatchStore} watch - The watch to remove
   */
  removeWatchByRef = (watch) => {
    const index = this.watches.indexOf(watch);
    if (index === -1) return;

    // Cleanup autocomplete
    AutocompleteConsumer.removeAutocompleteFromWatch(this, watch);

    // Destroy the watch's editor
    watch.destroy();

    // Remove from array
    this.watches.splice(index, 1);
  };

  run = () => {
    this.watches.forEach((watch) => watch.run());
  };

  destroy() {
    // Destroy all watch editors
    this.watches.forEach((watch) => watch.destroy());
    this.watches = [];

    if (this.autocompleteDisposables) {
      AutocompleteConsumer.dispose(this.autocompleteDisposables);
      this.autocompleteDisposables = null;
    }
  }
}
