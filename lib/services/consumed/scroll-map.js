/** @babel */

/**
 * Scroll Map integration for Hydrogen cell breakpoints.
 * Displays markers on the scroll bar for each cell boundary.
 */
export class ScrollMapConsumer {
  constructor() {
    this.handle = null;
  }

  consume(scrollMapService) {
    // Use the new functional API (scroll-map v2.0.0+)
    this.handle = scrollMapService.register({
      name: "hydrogen",
      throttle: 50,
      getMarkers(editor) {
        const buffer = editor.buffer;
        if (!buffer.hbpMarkerLayer) {
          return [];
        }
        const markers = buffer.hbpMarkerLayer.getMarkers();
        return markers.map((marker) => ({
          row: editor.screenPositionForBufferPosition(marker.getRange().start).row,
        }));
      },
      triggers: (editor, update) => [
        editor.onDidStopChanging(update),
      ],
    });

    return this.handle;
  }
}

const scrollMapConsumer = new ScrollMapConsumer();
export default scrollMapConsumer;
