/** @babel */
/** @jsx React.createElement */

import React from "react";
import { observer } from "mobx-react";
import Display from "./display";

@observer
class ScrollList extends React.Component {
  scrollToBottom() {
    if (!this.el) {
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

  render() {
    if (this.props.outputs.length === 0) {
      return null;
    }
    return (
      <div
        className="scroll-list multiline-container native-key-bindings"
        tabIndex={-1}
        style={{
          fontSize:
            atom.config.get(`hydrogen-next.outputAreaFontSize`) || "inherit",
        }}
        ref={(el) => {
          this.el = el;
        }}
        hydrogen-wrapoutput={atom.config
          .get(`hydrogen-next.wrapOutput`)
          .toString()}
      >
        {this.props.outputs.map((output, index) => (
          <div className="scroll-list-item">
            <Display output={output} key={index} />
          </div>
        ))}
      </div>
    );
  }
}

export default ScrollList;
