/** @babel */

import { CompositeDisposable } from "atom";
import { reactFactory } from "../utils";

/**
 * Base class for hydrogen-next dock panes.
 * Provides common setup and teardown for React-based panes.
 */
export default class BasePane {
  element = document.createElement("div");
  disposer = new CompositeDisposable();

  /**
   * @param {Object} config - Pane configuration
   * @param {string} config.title - Pane title
   * @param {string} config.uri - Pane URI
   * @param {string} config.defaultLocation - Default dock location
   * @param {string[]} config.allowedLocations - Allowed dock locations
   * @param {string[]} [config.classNames] - Additional class names
   * @param {React.Element} [config.reactElement] - React element to render
   * @param {HTMLElement} [config.domElement] - DOM element to append (alternative to reactElement)
   * @param {Function} [config.onDispose] - Called before dispose
   */
  constructor(config) {
    this.config = config;

    // Add base class and any additional classes
    this.element.classList.add("hydrogen-next");
    if (config.classNames) {
      this.element.classList.add(...config.classNames);
    }

    // Render React element or append DOM element
    if (config.reactElement) {
      reactFactory(config.reactElement, this.element, null, this.disposer);
    } else if (config.domElement) {
      this.element.appendChild(config.domElement);
    }
  }

  getTitle = () => this.config.title;
  getURI = () => this.config.uri;
  getDefaultLocation = () => this.config.defaultLocation;
  getAllowedLocations = () => this.config.allowedLocations;

  destroy() {
    if (this.config.onDispose) {
      this.config.onDispose();
    }
    this.disposer.dispose();
    this.element.remove?.();
  }
}
