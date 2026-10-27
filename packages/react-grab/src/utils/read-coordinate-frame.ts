import {
  SELECTION_MAX_ANCESTOR_TRANSFORMS,
  SELECTION_MAX_SCROLL_CONTAINERS,
  SELECTION_TRANSFORM_EPSILON,
} from "../constants.js";
import type {
  AncestorTransformFrame,
  AxisRect,
  CoordinateFrame,
  ScrollContainerFrame,
} from "../types.js";
import { buildCoordinateFrame, formatCoordinateFrameText } from "./coordinate-frame.js";
import { getComposedParentElement } from "./get-composed-parent-element.js";
import { isReactGrabElement } from "./is-react-grab-element.js";
import { isRootElement } from "./is-root-element.js";

export interface ReadCoordinateFrameInput {
  element?: Element | null;
  screenRect?: AxisRect | null;
  labelFor?: (element: Element) => string | null;
}

const SCROLLABLE_OVERFLOW = new Set(["auto", "scroll", "overlay"]);

export const readElementScreenRect = (element: Element): AxisRect => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
};

const elementLabel = (element: Element, labelFor?: (element: Element) => string | null): string => {
  const provided = labelFor?.(element);
  if (provided) return provided;
  const id = element.id ? `#${element.id}` : "";
  return `${element.tagName.toLowerCase()}${id}`;
};

const isScrollableStyle = (overflow: string): boolean => SCROLLABLE_OVERFLOW.has(overflow);

const readScrollContainers = (
  start: Element | null,
  labelFor?: (element: Element) => string | null,
): ScrollContainerFrame[] => {
  const containers: ScrollContainerFrame[] = [];
  const ownerWindow = start?.ownerDocument.defaultView ?? window;
  let current = start;
  while (current && containers.length < SELECTION_MAX_SCROLL_CONTAINERS) {
    if (!isReactGrabElement(current) && !isRootElement(current)) {
      const style = ownerWindow.getComputedStyle(current);
      const scrolls =
        isScrollableStyle(style.overflowX) ||
        isScrollableStyle(style.overflowY) ||
        isScrollableStyle(style.overflow);
      if (
        scrolls &&
        (current.scrollHeight > current.clientHeight + 1 ||
          current.scrollWidth > current.clientWidth + 1)
      ) {
        containers.push({
          label: elementLabel(current, labelFor),
          rect: readElementScreenRect(current),
          scrollLeft: current.scrollLeft,
          scrollTop: current.scrollTop,
          scrollWidth: current.scrollWidth,
          scrollHeight: current.scrollHeight,
        });
      }
    }
    current = getComposedParentElement(current);
  }
  return containers;
};

const isNear = (value: number, target: number): boolean =>
  Math.abs(value - target) <= SELECTION_TRANSFORM_EPSILON;

const readAncestorTransforms = (
  start: Element | null,
  labelFor?: (element: Element) => string | null,
): AncestorTransformFrame[] => {
  const transforms: AncestorTransformFrame[] = [];
  if (typeof DOMMatrix === "undefined") return transforms;
  const ownerWindow = start?.ownerDocument.defaultView ?? window;
  let current = start;
  while (current && transforms.length < SELECTION_MAX_ANCESTOR_TRANSFORMS) {
    if (!isReactGrabElement(current)) {
      const transform = ownerWindow.getComputedStyle(current).transform;
      if (transform && transform !== "none") {
        const matrix = new DOMMatrix(transform);
        const scaleX = Math.hypot(matrix.a, matrix.b) || 1;
        const scaleY = Math.hypot(matrix.c, matrix.d) || 1;
        const translateX = matrix.e;
        const translateY = matrix.f;
        const isIdentity =
          isNear(scaleX, 1) && isNear(scaleY, 1) && isNear(translateX, 0) && isNear(translateY, 0);
        if (!isIdentity) {
          transforms.push({
            label: elementLabel(current, labelFor),
            scaleX,
            scaleY,
            translateX,
            translateY,
            screenRect: readElementScreenRect(current),
          });
        }
      }
    }
    current = getComposedParentElement(current);
  }
  return transforms;
};

export const readNearestComponentAncestorRect = (
  element: Element,
  isComponent: (element: Element) => boolean,
): AxisRect | null => {
  let current = getComposedParentElement(element);
  while (current && !isRootElement(current)) {
    if (!isReactGrabElement(current) && isComponent(current)) return readElementScreenRect(current);
    current = getComposedParentElement(current);
  }
  return null;
};

export const readCommonComponentAncestorRect = (
  elements: readonly Element[],
  isComponent: (element: Element) => boolean,
): AxisRect | null => {
  const firstElement = elements[0];
  if (!firstElement) return null;
  let current = getComposedParentElement(firstElement);
  while (current) {
    const ancestor = current;
    const containsAll = elements.every(
      (element) => ancestor === element || ancestor.contains(element),
    );
    if (containsAll && !isReactGrabElement(ancestor) && isComponent(ancestor)) {
      return readElementScreenRect(ancestor);
    }
    current = getComposedParentElement(ancestor);
  }
  return null;
};

export const readVisibleViewportRect = (): AxisRect => {
  const visualViewport = window.visualViewport;
  if (!visualViewport) {
    return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  }
  return {
    x: visualViewport.offsetLeft,
    y: visualViewport.offsetTop,
    width: visualViewport.width,
    height: visualViewport.height,
  };
};

export const readCoordinateFrame = (
  input: ReadCoordinateFrameInput = {},
): CoordinateFrame | null => {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const anchor = input.element ?? document.body;
  const screenRect =
    input.screenRect ??
    (input.element ? readElementScreenRect(input.element) : readVisibleViewportRect());
  const root = document.documentElement;
  const body = document.body;
  const visualViewport = window.visualViewport;
  return buildCoordinateFrame({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    visualViewport: visualViewport
      ? {
          scale: visualViewport.scale,
          offsetLeft: visualViewport.offsetLeft,
          offsetTop: visualViewport.offsetTop,
          width: visualViewport.width,
          height: visualViewport.height,
        }
      : null,
    documentWidth: Math.max(root?.scrollWidth ?? 0, body?.scrollWidth ?? 0, window.innerWidth),
    documentHeight: Math.max(root?.scrollHeight ?? 0, body?.scrollHeight ?? 0, window.innerHeight),
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    devicePixelRatio: window.devicePixelRatio || 1,
    scrollContainers: anchor ? readScrollContainers(anchor, input.labelFor) : [],
    ancestorTransforms: anchor ? readAncestorTransforms(anchor, input.labelFor) : [],
    screenRect,
  });
};

export const appendCoordinateFrame = (
  text: string,
  element: Element | null,
  screenRect?: AxisRect | null,
  labelFor?: (element: Element) => string | null,
): { text: string; frame: CoordinateFrame | null } => {
  try {
    if (element && !(element instanceof Element)) return { text, frame: null };
    const frame = readCoordinateFrame({
      element,
      screenRect: screenRect ?? null,
      labelFor,
    });
    if (!frame) return { text, frame: null };
    return { text: `${text}\n${formatCoordinateFrameText(frame)}`, frame };
  } catch {
    return { text, frame: null };
  }
};
