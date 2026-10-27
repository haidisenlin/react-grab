import { convertParentPositionToIframe } from "./convert-parent-position-to-iframe.js";
import { findViewportPositionedAncestor } from "./find-viewport-positioned-ancestor.js";
import { getAccessibleIframeDocument } from "./get-accessible-iframe-document.js";
import { isIframeElement } from "./is-iframe-element.js";
import { isReactGrabElement } from "./is-react-grab-element.js";
import { isUserIgnoredElement } from "./is-user-ignored-element.js";

const borderBoxContainsPoint = (element: Element, clientX: number, clientY: number): boolean => {
  const bounds = element.getBoundingClientRect();
  return (
    clientX >= bounds.left &&
    clientX <= bounds.right &&
    clientY >= bounds.top &&
    clientY <= bounds.bottom
  );
};

const collectElementsAtPoint = (
  root: Document | ShadowRoot,
  clientX: number,
  clientY: number,
  collectedElements: Set<Element>,
): void => {
  const elements = root.elementsFromPoint(clientX, clientY);
  let canDescendIntoNestedRoots = true;
  let viewportLayer: Element | null = null;

  for (const element of elements) {
    if (isReactGrabElement(element)) continue;
    if (!viewportLayer) {
      const layer = findViewportPositionedAncestor(element);
      if (layer && borderBoxContainsPoint(layer, clientX, clientY)) viewportLayer = layer;
    }
    if (viewportLayer && element !== viewportLayer && !viewportLayer.contains(element)) continue;

    if (isUserIgnoredElement(element)) canDescendIntoNestedRoots = false;

    if (canDescendIntoNestedRoots && element.shadowRoot && element.shadowRoot !== root) {
      collectElementsAtPoint(element.shadowRoot, clientX, clientY, collectedElements);
    }

    if (canDescendIntoNestedRoots && isIframeElement(element)) {
      const iframeDocument = getAccessibleIframeDocument(element);
      if (iframeDocument) {
        const iframePosition = convertParentPositionToIframe(element, clientX, clientY);
        collectElementsAtPoint(
          iframeDocument,
          iframePosition.x,
          iframePosition.y,
          collectedElements,
        );
      }
    }

    collectedElements.add(element);
  }
};

export const getDeepElementsAtPoint = (clientX: number, clientY: number): Element[] => {
  const collectedElements = new Set<Element>();
  collectElementsAtPoint(document, clientX, clientY, collectedElements);
  return [...collectedElements];
};
