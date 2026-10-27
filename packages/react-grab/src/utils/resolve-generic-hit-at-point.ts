import {
  HIT_BORDER_SLOP_PX,
  HIT_PE_MARK_NODE_LIMIT,
  HIT_POINTER_EVENTS_NONE_ATTRIBUTE,
  HIT_SAME_BOX_EPSILON_PX,
  HIT_SAME_BOX_MAX_DEPTH,
  HIT_TEXT_NODE_SCAN_LIMIT,
} from "../constants.js";
import { convertParentPositionToIframe } from "./convert-parent-position-to-iframe.js";
import { getAccessibleIframeDocument } from "./get-accessible-iframe-document.js";
import { getElementTextBounds } from "./get-element-text-bounds.js";
import { isCssColorTransparent } from "./is-css-color-transparent.js";
import { isElementNode } from "./is-element-node.js";
import { isIframeElement } from "./is-iframe-element.js";
import { isReactGrabElement } from "./is-react-grab-element.js";
import { isRootElement } from "./is-root-element.js";
import { isShadowRoot } from "./is-shadow-root.js";
import { isUserIgnoredElement } from "./is-user-ignored-element.js";

const REPLACED_ELEMENT_TAGS = new Set([
  "BUTTON",
  "CANVAS",
  "IMG",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "VIDEO",
]);

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

let pointerEventsObserver: MutationObserver | null = null;
let didScanPointerEvents = false;
const pendingPointerEventsRoots: Element[] = [];
const pointerEventsNoneElements = new Set<Element>();
const observedShadowRoots = new WeakSet<ShadowRoot>();

const rectContains = (rect: DOMRect, clientX: number, clientY: number): boolean =>
  clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;

const isStructurallyVisible = (element: Element): boolean => {
  if (typeof element.checkVisibility !== "function") return true;
  return element.checkVisibility({
    opacityProperty: true,
    visibilityProperty: true,
  });
};

const isSameBox = (first: Element, second: Element): boolean => {
  const firstRect = first.getBoundingClientRect();
  const secondRect = second.getBoundingClientRect();
  return (
    Math.abs(firstRect.left - secondRect.left) < HIT_SAME_BOX_EPSILON_PX &&
    Math.abs(firstRect.top - secondRect.top) < HIT_SAME_BOX_EPSILON_PX &&
    Math.abs(firstRect.width - secondRect.width) < HIT_SAME_BOX_EPSILON_PX &&
    Math.abs(firstRect.height - secondRect.height) < HIT_SAME_BOX_EPSILON_PX
  );
};

const textNodeContainsPoint = (textNode: Text, clientX: number, clientY: number): boolean => {
  const range = textNode.ownerDocument.createRange();
  range.selectNodeContents(textNode);
  const rects = range.getClientRects();
  for (let rectIndex = 0; rectIndex < rects.length; rectIndex += 1) {
    const rect = rects[rectIndex];
    if (!rect) continue;
    if (
      clientX >= rect.left - HIT_BORDER_SLOP_PX &&
      clientX <= rect.right + HIT_BORDER_SLOP_PX &&
      clientY >= rect.top - HIT_BORDER_SLOP_PX &&
      clientY <= rect.bottom + HIT_BORDER_SLOP_PX
    ) {
      return true;
    }
  }
  return false;
};

const paintsAtPoint = (element: Element, clientX: number, clientY: number): boolean => {
  const rect = element.getBoundingClientRect();
  if (!rectContains(rect, clientX, clientY) || rect.width <= 0 || rect.height <= 0) return false;
  if (REPLACED_ELEMENT_TAGS.has(element.tagName)) return true;

  if (element instanceof SVGGeometryElement) {
    try {
      const screenMatrix = element.getScreenCTM();
      if (!screenMatrix) return false;
      const localPoint = new DOMPoint(clientX, clientY).matrixTransform(screenMatrix.inverse());
      const style = getComputedStyle(element);
      const fills =
        style.fill !== "none" &&
        !isCssColorTransparent(style.fill) &&
        element.isPointInFill(localPoint);
      const strokes = style.stroke !== "none" && element.isPointInStroke(localPoint);
      return fills || strokes;
    } catch {
      return false;
    }
  }
  if (element.namespaceURI === SVG_NAMESPACE) {
    if (element instanceof SVGTextContentElement) {
      return Boolean(element.textContent?.trim());
    }
    return false;
  }

  const textBounds = getElementTextBounds(element);
  if (!textBounds) return true;
  for (const textFragmentBounds of textBounds) {
    if (
      clientX >= textFragmentBounds.x &&
      clientX <= textFragmentBounds.x + textFragmentBounds.width &&
      clientY >= textFragmentBounds.y &&
      clientY <= textFragmentBounds.y + textFragmentBounds.height
    ) {
      return true;
    }
  }
  return false;
};

const observeShadowRoot = (shadowRoot: ShadowRoot) => {
  if (
    !pointerEventsObserver ||
    observedShadowRoots.has(shadowRoot) ||
    isReactGrabElement(shadowRoot.host)
  ) {
    return;
  }
  observedShadowRoots.add(shadowRoot);
  pointerEventsObserver.observe(shadowRoot, {
    attributeFilter: ["style", "class"],
    attributes: true,
    childList: true,
    subtree: true,
  });
};

const markPointerEventsElement = (element: Element, remaining: { count: number }) => {
  if (remaining.count <= 0 || isReactGrabElement(element)) return;
  remaining.count -= 1;
  if (getComputedStyle(element).pointerEvents === "none") {
    element.setAttribute(HIT_POINTER_EVENTS_NONE_ATTRIBUTE, "");
    pointerEventsNoneElements.add(element);
  } else {
    element.removeAttribute(HIT_POINTER_EVENTS_NONE_ATTRIBUTE);
    pointerEventsNoneElements.delete(element);
  }
  const shadowRoot = element.shadowRoot;
  if (shadowRoot) {
    observeShadowRoot(shadowRoot);
    for (const child of shadowRoot.children) {
      markPointerEventsElement(child, remaining);
    }
  }
  for (const child of element.children) {
    markPointerEventsElement(child, remaining);
  }
};

const flushPointerEventsMarks = () => {
  const remaining = { count: HIT_PE_MARK_NODE_LIMIT };
  if (!didScanPointerEvents && document.body) {
    didScanPointerEvents = true;
    markPointerEventsElement(document.body, remaining);
    pendingPointerEventsRoots.length = 0;
    return;
  }
  const roots = pendingPointerEventsRoots.splice(0);
  for (const root of roots) {
    if (!root.isConnected) continue;
    markPointerEventsElement(root, remaining);
  }
};

const ensurePointerEventsIndex = () => {
  if (typeof MutationObserver === "undefined" || !document.body) return;
  if (!pointerEventsObserver) {
    pointerEventsObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" && record.target instanceof Element) {
          pendingPointerEventsRoots.push(record.target);
        }
        if (record.type === "childList") {
          for (const node of record.addedNodes) {
            if (node instanceof Element) pendingPointerEventsRoots.push(node);
          }
        }
      }
    });
    pointerEventsObserver.observe(document.documentElement, {
      attributeFilter: ["style", "class"],
      attributes: true,
      childList: true,
      subtree: true,
    });
  }
  flushPointerEventsMarks();
};

const stackAtPoint = (
  root: Document | ShadowRoot,
  clientX: number,
  clientY: number,
  seenRoots: Set<Document | ShadowRoot>,
): Element[] => {
  if (seenRoots.has(root) || typeof root.elementsFromPoint !== "function") return [];
  seenRoots.add(root);
  const stack: Element[] = [];
  for (const element of root.elementsFromPoint(clientX, clientY)) {
    if (isReactGrabElement(element) || isUserIgnoredElement(element)) continue;
    const shadowRoot = element.shadowRoot;
    if (shadowRoot && shadowRoot !== root) {
      stack.push(...stackAtPoint(shadowRoot, clientX, clientY, seenRoots));
    }
    if (isIframeElement(element)) {
      const iframeDocument = getAccessibleIframeDocument(element);
      if (iframeDocument) {
        const iframePosition = convertParentPositionToIframe(element, clientX, clientY);
        stack.push(...stackAtPoint(iframeDocument, iframePosition.x, iframePosition.y, seenRoots));
      }
    }
    stack.push(element);
  }
  return stack;
};

const paintedPointerEventsElement = (
  clientX: number,
  clientY: number,
  stack: readonly Element[],
  top: Element | null,
): Element | null => {
  let deepest: Element | null = null;
  for (const node of pointerEventsNoneElements) {
    if (!node.isConnected) {
      pointerEventsNoneElements.delete(node);
      continue;
    }
    if (isReactGrabElement(node) || isUserIgnoredElement(node)) continue;
    if (!isStructurallyVisible(node) || !paintsAtPoint(node, clientX, clientY)) continue;
    let ancestor = node.parentElement;
    while (ancestor?.hasAttribute(HIT_POINTER_EVENTS_NONE_ATTRIBUTE)) {
      ancestor = ancestor.parentElement;
    }
    if (!ancestor || !stack.includes(ancestor)) continue;
    if (top && top !== ancestor && !ancestor.contains(top)) continue;
    const style = getComputedStyle(node);
    if (
      top &&
      top !== ancestor &&
      style.position === "static" &&
      node.namespaceURI !== SVG_NAMESPACE
    ) {
      continue;
    }
    if (top && top !== ancestor && !top.contains(node) && paintsAtPoint(top, clientX, clientY)) {
      continue;
    }
    if (!deepest || deepest.contains(node)) deepest = node;
  }
  return deepest;
};

const topElementAtPoint = (
  clientX: number,
  clientY: number,
  stack: readonly Element[],
): Element | null => {
  let top: Element | null = null;
  let topIndex = -1;
  for (let index = 0; index < stack.length; index += 1) {
    const element = stack[index];
    if (!element || isRootElement(element)) break;
    if (!isStructurallyVisible(element)) continue;
    top = element;
    topIndex = index;
    break;
  }
  if (!top || paintsAtPoint(top, clientX, clientY)) return top;
  for (let index = topIndex + 1; index < stack.length; index += 1) {
    const element = stack[index];
    if (!element || isRootElement(element)) break;
    if (!isStructurallyVisible(element)) continue;
    if (paintsAtPoint(element, clientX, clientY)) return element;
  }
  return top;
};

const elementForTextNode = (
  textNode: Text,
  top: Element,
  clientX: number,
  clientY: number,
): Element | null => {
  if (!textNode.textContent?.trim() || !textNodeContainsPoint(textNode, clientX, clientY)) {
    return null;
  }
  const parentElement = textNode.parentElement;
  if (!parentElement || isRootElement(parentElement) || isReactGrabElement(parentElement)) {
    return null;
  }
  if (parentElement !== top && !top.contains(parentElement)) return null;
  return parentElement;
};

const caretTextElement = (clientX: number, clientY: number, top: Element): Element | null => {
  const ownerDocument = top.ownerDocument;
  let caretNode: Node | null = null;
  const hitRoot = top.getRootNode();
  if (typeof ownerDocument.caretPositionFromPoint === "function") {
    const caretPosition = ownerDocument.caretPositionFromPoint(clientX, clientY, {
      shadowRoots: isShadowRoot(hitRoot) ? [hitRoot] : [],
    });
    caretNode = caretPosition?.offsetNode ?? null;
  } else if (typeof ownerDocument.caretRangeFromPoint === "function") {
    caretNode = ownerDocument.caretRangeFromPoint(clientX, clientY)?.startContainer ?? null;
  }
  if (caretNode instanceof Text) {
    const caretElement = elementForTextNode(caretNode, top, clientX, clientY);
    if (caretElement) return caretElement;
  }
  if (typeof ownerDocument.createTreeWalker !== "function") return null;
  const walker = ownerDocument.createTreeWalker(top, NodeFilter.SHOW_TEXT);
  let scannedCount = 0;
  let currentNode = walker.nextNode();
  while (currentNode && scannedCount < HIT_TEXT_NODE_SCAN_LIMIT) {
    scannedCount += 1;
    if (currentNode instanceof Text) {
      const textElement = elementForTextNode(currentNode, top, clientX, clientY);
      if (textElement) return textElement;
    }
    currentNode = walker.nextNode();
  }
  return null;
};

const deepestSameBoxElement = (element: Element, clientX: number, clientY: number): Element => {
  let current = element;
  for (let depth = 0; depth < HIT_SAME_BOX_MAX_DEPTH; depth += 1) {
    let deeperChild: Element | null = null;
    for (const child of current.children) {
      if (!isElementNode(child) || isReactGrabElement(child) || isUserIgnoredElement(child)) {
        continue;
      }
      if (!rectContains(child.getBoundingClientRect(), clientX, clientY)) continue;
      if (!isSameBox(child, current)) continue;
      deeperChild = child;
    }
    if (!deeperChild) return current;
    current = deeperChild;
  }
  return current;
};

export const resolveGenericHitAtPoint = (clientX: number, clientY: number): Element | null => {
  if (typeof document === "undefined" || typeof document.elementsFromPoint !== "function") {
    return null;
  }
  try {
    ensurePointerEventsIndex();
    const stack = stackAtPoint(document, clientX, clientY, new Set());
    const top = topElementAtPoint(clientX, clientY, stack);
    const paintedNone = paintedPointerEventsElement(clientX, clientY, stack, top);
    const hit = paintedNone ?? top;
    if (!hit || isRootElement(hit)) return null;
    const textElement = caretTextElement(clientX, clientY, hit);
    return deepestSameBoxElement(textElement ?? hit, clientX, clientY);
  } catch {
    return null;
  }
};
