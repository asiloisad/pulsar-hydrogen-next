/** @babel */
/** @jsx React.createElement */

import React from "react"
import { toJS } from "mobx"
import { observer } from "mobx-react"
import {
  DisplayData,
  ExecuteResult,
  StreamText,
  KernelOutputError,
  Output,
  Media,
  RichMedia
} from "@nteract/outputs"
import Plotly from "./plotly"
import {
  VegaLite1,
  VegaLite2,
  VegaLite3,
  VegaLite4,
  VegaLite5,
  Vega2,
  Vega3,
  Vega4,
  Vega5
} from "./vega"
import Markdown from "./markdown"
import HTML from "./html"
import LaTeX from "./latex"
// All supported media types for output go here
export const supportedMediaTypes = (
  <RichMedia>
    <Vega5 />
    <Vega4 />
    <Vega3 />
    <Vega2 />
    <Plotly />
    <VegaLite5 />
    <VegaLite4 />
    <VegaLite3 />
    <VegaLite2 />
    <VegaLite1 />
    <Media.Json />
    <Media.JavaScript />
    <HTML />
    <Markdown />
    <LaTeX />
    <Media.SVG />
    <Media.Image mediaType="image/gif" />
    <Media.Image mediaType="image/jpeg" />
    <Media.Image mediaType="image/png" />
    <Media.Plain />
  </RichMedia>
)
export function isTextOutputOnly(data) {
  const supported = React.Children.map(
    supportedMediaTypes.props.children,
    mediaComponent => mediaComponent.props.mediaType
  )
  const bundleMediaTypes = [...Object.keys(data)].filter(mediaType =>
    supported.includes(mediaType)
  )
  return bundleMediaTypes.length === 1 && bundleMediaTypes[0] === "text/plain"
    ? true
    : false
}

@observer
class Display extends React.Component {
  render() {
    const output = toJS(this.props.output)
    return (
      <Output output={output}>
        <ExecuteResult expanded>{supportedMediaTypes}</ExecuteResult>
        <DisplayData expanded>{supportedMediaTypes}</DisplayData>
        <StreamText expanded />
        <KernelOutputError expanded />
      </Output>
    )
  }
}

export default Display
