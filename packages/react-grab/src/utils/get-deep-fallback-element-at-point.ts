import { convertParentPositionToIframe } from "./convert-parent-position-to-iframe.js";
import { findViewportPositionedAncestor } from "./find-viewport-positioned-ancestor.js";
import { getAccessibleIframeDocument } from "./get-accessible-iframe-document.js";
import { isIframeElement } from "./is-iframe-element.js";
import { isReactGrabElement } from "./is-react-grab-element.js";
import { isUserIgnoredElement } from "./is-user-ignored-element.js";
import { isValidGrabbableElement } from "./is-valid-grabbable-element.js";
import { isElementPaintedAtPosition } from "./is-element-painted-at-position.js";
import { isWithinScope } from "./runtime-mode.js";

const borderBoxContainsPoint = (element: Element, clientX: number, clientY: number): boolean => {
  const bounds = element.getBoundingClientRect();
  return (
    clientX >= bounds.left &&
    clientX <= bounds.right &&
    clientY >= bounds.top &&
    clientY <= bounds.bottom
  );
};

const findDeepFallbackElementAtPoint = (
  root: Document | ShadowRoot,
  clientX: number,
  clientY: number,
  topClientX: number,
  topClientY: number,
): Element | null => {
  let canDescendIntoNestedRoots = true;
  let viewportLayer: Element | null = null;

  for (const candidateElement of root.elementsFromPoint(clientX, clientY)) {
    if (isReactGrabElement(candidateElement)) continue;
    if (isUserIgnoredElement(candidateElement)) {
      canDescendIntoNestedRoots = false;
      continue;
    }
    if (!isWithinScope(candidateElement)) continue;

    if (!viewportLayer) {
      const layer = findViewportPositionedAncestor(candidateElement);
      if (layer && borderBoxContainsPoint(layer, topClientX, topClientY)) {
        viewportLayer = layer;
      }
    }
    if (
      viewportLayer &&
      candidateElement !== viewportLayer &&
      !viewportLayer.contains(candidateElement)
    ) {
      continue;
    }

    const shadowRoot = candidateElement.shadowRoot;
    if (canDescendIntoNestedRoots && shadowRoot && shadowRoot !== root) {
      const shadowTarget = findDeepFallbackElementAtPoint(
        shadowRoot,
        clientX,
        clientY,
        topClientX,
        topClientY,
      );
      if (shadowTarget) return shadowTarget;
    }

    if (canDescendIntoNestedRoots && isIframeElement(candidateElement)) {
      const iframeDocument = getAccessibleIframeDocument(candidateElement);
      if (iframeDocument) {
        const iframePosition = convertParentPositionToIframe(candidateElement, clientX, clientY);
        const iframeTarget = findDeepFallbackElementAtPoint(
          iframeDocument,
          iframePosition.x,
          iframePosition.y,
          topClientX,
          topClientY,
        );
        if (iframeTarget) return iframeTarget;
      }
    }

    if (!isValidGrabbableElement(candidateElement)) continue;
    // Empty padding inside a fixed sidebar or sticky bar still belongs to that
    // layer. Falling through to the scrolling page behind it would select the
    // wrong target and make chrome impossible to grab.
    if (
      candidateElement !== viewportLayer &&
      !isElementPaintedAtPosition(candidateElement, topClientX, topClientY)
    ) {
      continue;
    }
    return candidateElement;
  }

  return null;
};

export const getDeepFallbackElementAtPoint = (clientX: number, clientY: number): Element | null =>
  findDeepFallbackElementAtPoint(document, clientX, clientY, clientX, clientY);
