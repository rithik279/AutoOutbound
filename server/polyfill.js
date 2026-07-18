// Polyfill for DOMMatrix which is required by pdfjs-dist in Node < 20.16
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {}
}
