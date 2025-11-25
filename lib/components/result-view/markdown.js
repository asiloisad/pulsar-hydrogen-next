/** @babel */
/** @jsx React.createElement */

/**
 * Markdown component using Pulsar's built-in markdown renderer.
 * Uses atom.ui.markdown.render() which is based on markdown-it.
 */
import React from "react"

export class Markdown extends React.PureComponent {
  static defaultProps = {
    data: "",
    mediaType: "text/markdown"
  }

  render() {
    // Use Pulsar's built-in markdown renderer
    const html = atom.ui.markdown.render(this.props.data, {
      sanitize: true,
      breaks: true,
      handleFrontMatter: false,
      transformImageLinks: false,
      transformAtomLinks: false,
      transformNonFqdnLinks: false
    })

    return (
      <div
        className="markdown"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }
}
export default Markdown
