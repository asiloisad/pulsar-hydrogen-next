/** @babel */

import { CompositeDisposable, Disposable } from "atom";

/**
 * Manages autocomplete for watch editors.
 *
 * NOTE: Watch editor autocomplete is currently disabled due to a bug in
 * autocomplete-plus's subsequence-provider that crashes when used with
 * non-workspace editors. The subsequence-provider tries to look up the
 * editor's buffer in watchedBuffers, but non-workspace editors aren't tracked.
 *
 * Once autocomplete-plus is fixed upstream (by adding a guard in
 * bufferToSubsequenceMatches and getSuggestions), this can be re-enabled.
 */
export class AutocompleteWatchEditor {
  isEnabled = false;

  /**
   * Initialize autocomplete for watch editors.
   * Currently disabled due to autocomplete-plus bug.
   */
  observe(store, watchEditor) {
    // Disabled: autocomplete-plus crashes with non-workspace editors
    // See: subsequence-provider.js bufferToSubsequenceMatches()
    return new Disposable();
  }

  /**
   * Add autocomplete to a specific watch editor (no-op while disabled).
   */
  addAutocompleteToWatch(watchesStore, watch) {
    // Disabled
  }

  /**
   * Remove autocomplete from a specific watch editor (no-op while disabled).
   */
  removeAutocompleteFromWatch(watchesStore, watch) {
    // Disabled
  }

  /**
   * Remove and dispose an autocomplete disposable (no-op while disabled).
   */
  dispose(disposable) {
    if (disposable) {
      disposable.dispose();
    }
  }

  /**
   * Add a disposable to track (no-op while disabled).
   */
  register(disposable) {
    // Disabled
  }
}

const autocompleteConsumer = new AutocompleteWatchEditor();
export default autocompleteConsumer;
