---
"react-grab": minor
---

Add drag-to-select regions in the existing selection mode. Empty drags freeze a rectangle, accept a note, and copy viewport, page, and neighbor context. Regions that start on fixed or sticky UI stay in viewport coordinates while the page scrolls. Clicks on links and buttons in selection mode select them instead of activating them.

Selection copies also include a coordinate frame (viewport, visual viewport, scroll, DPR, estimated zoom, scroll containers, and ancestor transforms) plus optional numbered screenshots from a lazy viewport capture.

Selection hover hit-tests across layers with `elementsFromPoint`. Elements with `pointer-events: none` are selectable where they paint, text is resolved with the caret APIs, and the deepest element at the point is chosen. Inputs, selects, images, canvases, SVGs, and disabled buttons stay selectable, including nodes added after selection mode starts.

Script-tag pages load screenshots from `capture.global.js`, a separate IIFE that bundles snapDOM and the html-to-image fallback. It is requested from the same directory as `index.global.js`, or from `window.__REACT_GRAB_CAPTURE_SRC__`.
