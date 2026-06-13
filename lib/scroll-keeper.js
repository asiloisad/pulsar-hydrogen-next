/** @babel */

let scrollKeeperService = null;

export function setScrollKeeperService(service) {
  scrollKeeperService = service;
}

export function preserveScroll(editor, callback) {
  if (!editor) {
    return callback();
  }

  if (scrollKeeperService && typeof scrollKeeperService.preserveScroll === "function") {
    return scrollKeeperService.preserveScroll(editor, callback);
  }

  if (editor.emitter) {
    const request = { handled: false, perform: callback };
    editor.emitter.emit("scroll-keeper-requested", request);
    if (request.handled) {
      return;
    }
  }

  return callback();
}
