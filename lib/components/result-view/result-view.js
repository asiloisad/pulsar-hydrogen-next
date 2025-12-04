/** @babel */
/** @jsx React.createElement */

import { CompositeDisposable } from "atom";
import React from "react";
import { observer } from "mobx-react";
import { action, observable, makeObservable } from "mobx";
import Display from "./display";
import Status from "./status";
const SCROLL_HEIGHT = 600;

@observer
class ResultViewComponent extends React.Component {
  containerTooltip = new CompositeDisposable();
  buttonTooltip = new CompositeDisposable();
  closeTooltip = new CompositeDisposable();
  _wheelHandler = null;
  expanded = false;

  constructor(props) {
    super(props);
    makeObservable(this, {
      expanded: observable,
      toggleExpand: action,
    });
  }
  getAllText = () => {
    if (!this.el) {
      return "";
    }
    return this.el.innerText ? this.el.innerText : "";
  };
  getImage = () => {
    if (!this.el) {
      return null;
    }
    // Find image in output (supports img, canvas, svg)
    const img = this.el.querySelector("img");
    if (img) {
      return img;
    }
    const canvas = this.el.querySelector("canvas");
    if (canvas) {
      return canvas;
    }
    // Check for SVG plots (in output-svg container, not LaTeX)
    const svg = this.el.querySelector(".output-svg svg");
    if (svg) {
      return svg;
    }
    return null;
  };
  hasCopyableContent = (outputs) => {
    return outputs.some((o) => {
      if (o.output_type === "stream") return true;
      if (o.output_type === "error") return true;
      if (o.data) {
        // If has text/latex, skip copy (LaTeX renders as SVG, not copyable as text)
        if (o.data["text/latex"]) return false;
        // Check for other copyable content
        return (
          o.data["text/plain"] ||
          o.data["image/png"] ||
          o.data["image/jpeg"] ||
          o.data["image/gif"] ||
          o.data["image/svg+xml"]
        );
      }
      return false;
    });
  };
  handleClick = (event) => {
    if (event.ctrlKey || event.metaKey) {
      this.openInEditor();
    } else {
      this.copyToClipboard();
    }
  };
  checkForSelection = (event) => {
    const selection = document.getSelection();

    if (selection && selection.toString()) {
      return;
    } else {
      this.handleClick(event);
    }
  };
  copyToClipboard = async () => {
    // Try to copy image first
    const imageEl = this.getImage();
    if (imageEl) {
      try {
        await this.copyImageToClipboard(imageEl);
        atom.notifications.addSuccess("Image copied to clipboard");
        return;
      } catch (err) {
        console.error("Failed to copy image:", err);
        // Fall through to text copy
      }
    }

    // Copy text
    const text = this.getAllText();
    if (text) {
      atom.clipboard.write(text);
      atom.notifications.addSuccess("Copied to clipboard");
    } else {
      atom.notifications.addWarning("Nothing to copy");
    }
  };
  copyImageToClipboard = async (imageEl) => {
    // Create a canvas to get image data
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (imageEl.tagName === "CANVAS") {
      // It's already a canvas
      canvas.width = imageEl.width;
      canvas.height = imageEl.height;
      ctx.drawImage(imageEl, 0, 0);
    } else if (imageEl.tagName === "svg" || imageEl.tagName === "SVG") {
      // SVG element - convert to image first
      const svgData = new XMLSerializer().serializeToString(imageEl);
      const svgBlob = new Blob([svgData], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });

      canvas.width = img.width || imageEl.clientWidth || 800;
      canvas.height = img.height || imageEl.clientHeight || 600;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
    } else {
      // It's an img element
      canvas.width = imageEl.naturalWidth || imageEl.width;
      canvas.height = imageEl.naturalHeight || imageEl.height;
      ctx.drawImage(imageEl, 0, 0);
    }

    // Convert to blob and copy
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
  };
  openInEditor = () => {
    atom.workspace
      .open()
      .then((editor) => editor.insertText(this.getAllText()));
  };
  addCopyTooltip = (element, comp) => {
    if (!element || !comp.disposables || comp.disposables.size > 0) {
      return;
    }
    comp.add(
      atom.tooltips.add(element, {
        title: `Click to copy,
        ${
          process.platform === "darwin" ? "Cmd" : "Ctrl"
        }+Click to open in editor`,
      })
    );
  };
  addCloseButtonTooltip = (element, comp) => {
    if (!element || !comp.disposables || comp.disposables.size > 0) {
      return;
    }
    comp.add(
      atom.tooltips.add(element, {
        title: this.props.store.executionCount
          ? `Close (Out[${this.props.store.executionCount}])`
          : "Close result",
      })
    );
  };
  addCopyButtonTooltip = (element) => {
    this.addCopyTooltip(element, this.buttonTooltip);
  };
  onWheel = (element) => {
    return (event) => {
      const clientHeight = element.clientHeight;
      const scrollHeight = element.scrollHeight;
      const clientWidth = element.clientWidth;
      const scrollWidth = element.scrollWidth;
      const scrollTop = element.scrollTop;
      const scrollLeft = element.scrollLeft;
      const atTop = scrollTop !== 0 && event.deltaY < 0;
      const atLeft = scrollLeft !== 0 && event.deltaX < 0;
      const atBottom =
        scrollTop !== scrollHeight - clientHeight && event.deltaY > 0;
      const atRight =
        scrollLeft !== scrollWidth - clientWidth && event.deltaX > 0;

      if (clientHeight < scrollHeight && (atTop || atBottom)) {
        event.stopPropagation();
      } else if (clientWidth < scrollWidth && (atLeft || atRight)) {
        event.stopPropagation();
      }
    };
  };

  toggleExpand = () => {
    this.expanded = !this.expanded;
  };

  render() {
    const { outputs, status, isPlain, position } = this.props.store;
    const inlineStyle = {
      marginLeft: `${position.lineLength + position.charWidth}px`,
      marginTop: `-${position.lineHeight}px`,
      userSelect: "text",
    };

    if (outputs.length === 0 || !this.props.showResult) {
      const kernel = this.props.kernel;
      return (
        <Status
          status={
            kernel && kernel.executionState !== "busy" && status === "running"
              ? "error"
              : status
          }
          style={inlineStyle}
        />
      );
    }

    return (
      <div
        className={`${
          isPlain ? "inline-container" : "multiline-container"
        } native-key-bindings`}
        tabIndex={-1}
        onClick={isPlain ? this.checkForSelection : undefined}
        style={
          isPlain
            ? inlineStyle
            : {
                maxWidth: `${position.editorWidth - 2 * position.charWidth}px`,
                margin: "0px",
                userSelect: "text",
              }
        }
        hydrogen-wrapoutput={atom.config
          .get(`hydrogen-next.wrapOutput`)
          .toString()}
      >
        <div
          className="hydrogen_cell_display"
          ref={(ref) => {
            if (!ref) {
              return;
            }
            this.el = ref;
            isPlain
              ? this.addCopyTooltip(ref, this.containerTooltip)
              : this.containerTooltip.dispose();

            // As of this writing React's event handler doesn't properly handle
            // event.stopPropagation() for events outside the React context.
            if (!this.expanded && !isPlain && ref) {
              // Remove previous handler if exists
              if (this._wheelHandler) {
                ref.removeEventListener("wheel", this._wheelHandler);
              }
              this._wheelHandler = this.onWheel(ref);
              ref.addEventListener("wheel", this._wheelHandler, {
                passive: true,
              });
            }
          }}
          style={{
            maxHeight: this.expanded ? "100%" : `${SCROLL_HEIGHT}px`,
            overflowY: "auto",
          }}
        >
          {outputs.map((output, index) => (
            <Display output={output} key={index} />
          ))}
        </div>
        {isPlain ? null : (
          <div className="toolbar">
            <div
              className="icon icon-x"
              onClick={this.props.destroy}
              ref={(ref) => this.addCloseButtonTooltip(ref, this.closeTooltip)}
            />

            <div
              style={{
                flex: 1,
                minHeight: "0.25em",
              }}
            />

            {this.hasCopyableContent(outputs) ? (
              <div
                className="icon icon-clippy"
                onClick={this.handleClick}
                ref={this.addCopyButtonTooltip}
              />
            ) : null}

            {this.el && this.el.scrollHeight > SCROLL_HEIGHT ? (
              <div
                className={`icon icon-${this.expanded ? "fold" : "unfold"}`}
                onClick={this.toggleExpand}
              />
            ) : null}
          </div>
        )}
      </div>
    );
  }

  scrollToBottom() {
    if (
      !this.el ||
      this.expanded ||
      this.props.store.isPlain ||
      atom.config.get(`hydrogen-next.autoScroll`) === false
    ) {
      return;
    }
    const scrollHeight = this.el.scrollHeight;
    const height = this.el.clientHeight;
    const maxScrollTop = scrollHeight - height;
    this.el.scrollTop = maxScrollTop > 0 ? maxScrollTop : 0;
  }

  componentDidUpdate() {
    this.scrollToBottom();
  }

  componentDidMount() {
    this.scrollToBottom();
  }

  componentWillUnmount() {
    // Remove wheel event listener to prevent memory leak
    if (this.el && this._wheelHandler) {
      this.el.removeEventListener("wheel", this._wheelHandler);
      this._wheelHandler = null;
    }
    this.containerTooltip.dispose();
    this.buttonTooltip.dispose();
    this.closeTooltip.dispose();
  }
}

export default ResultViewComponent;
