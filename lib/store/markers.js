/** @babel */

export default class MarkerStore {
  markers = new Map();

  clear() {
    this.markers.forEach((bubble) => {
      if (!bubble.destroyed) bubble.destroy();
    });
    this.markers.clear();
  }

  clearOnRow(row) {
    let destroyed = false;
    this.markers.forEach((bubble, key) => {
      if (bubble.destroyed) return;
      const { start, end } = bubble.marker.getBufferRange();

      if (start.row <= row && row <= end.row) {
        this.delete(key);
        destroyed = true;
      }
    });
    return destroyed;
  }

  new(bubble) {
    this.markers.set(bubble.marker.id, bubble);
  }

  delete(key) {
    const bubble = this.markers.get(key);
    if (bubble && !bubble.destroyed) {
      bubble.destroy();
    }
    this.markers.delete(key);
  }
}
