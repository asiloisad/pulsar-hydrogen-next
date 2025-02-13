'use babel'
/** @jsx React.createElement */

export const Vega = mediaType => {
  const embed = ({ data, options, onResult, onError }) => (
    <VegaEmbed
      mediaType={mediaType}
      spec={data}
      options={options}
      resultHandler={onResult}
      errorHandler={onError}
    />
  )

  embed.defaultProps = {
    mediaType
  }
  embed.MIMETYPE = mediaType

  return embed
}

export const Vega2 = Vega("application/vnd.vega.v2+json")
export const Vega3 = Vega("application/vnd.vega.v3+json")
export const Vega4 = Vega("application/vnd.vega.v4+json")
export const Vega5 = Vega("application/vnd.vega.v5+json")
export const VegaLite1 = Vega("application/vnd.vegalite.v1+json")
export const VegaLite2 = Vega("application/vnd.vegalite.v2+json")
export const VegaLite3 = Vega("application/vnd.vegalite.v3+json")
export const VegaLite4 = Vega("application/vnd.vegalite.v4+json")
export const VegaLite5 = Vega("application/vnd.vegalite.v5+json")
