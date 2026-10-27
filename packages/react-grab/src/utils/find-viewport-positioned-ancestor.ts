import { isReactGrabElement } from "./is-react-grab-element.js";
import { isRootElement } from "./is-root-element.js";
import { getComposedParentElement } from "./get-composed-parent-element.js";

const isViewportPosition = (position: string): boolean =>
  position === "fixed" || position === "sticky";

// The outermost fixed or sticky ancestor is the layer that stays with the
// viewport. Walking to the outermost one means a region drawn on a sidebar
// stays put even when the hit is a nested icon, and a fixed app shell is
// recognized as viewport-anchored instead of scrolling with the document.
export const findViewportPositionedAncestor = (element: Element): Element | null => {
  const ownerWindow = element.ownerDocument.defaultView;
  if (!ownerWindow) return null;

  let currentElement: Element | null = element;
  let viewportLayer: Element | null = null;
  while (currentElement && !isRootElement(currentElement)) {
    if (isReactGrabElement(currentElement)) return viewportLayer;
    const position = ownerWindow.getComputedStyle(currentElement).position;
    if (isViewportPosition(position)) viewportLayer = currentElement;
    currentElement = getComposedParentElement(currentElement);
  }
  return viewportLayer;
};

export const isViewportPositionedElement = (element: Element): boolean =>
  findViewportPositionedAncestor(element) !== null;
