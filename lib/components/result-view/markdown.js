/** @babel */
/** @jsx React.createElement */

/**
 * Adapted from
 * https://github.com/nteract/nteract/blob/master/packages/outputs/src/components/media/markdown.tsx
 * Copyright (c) 2016 - present, nteract contributors All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 *
 * @NOTE: This `Markdown` component could be used exactly same as the original `Media.Markdown` component of @nteract/outputs,
 *        except that this file adds a class name to it for further stylings in styles/hydrogen-next.less.
 */
import MarkdownComponent from "@nteract/markdown"
import React from "react"

export class Markdown extends React.PureComponent {
  static defaultProps = {
    data: "",
    mediaType: "text/markdown"
  }

  render() {
    return (
      <div className="markdown">
        <MarkdownComponent source={this.props.data} />
      </div>
    )
  }
}
export default Markdown
