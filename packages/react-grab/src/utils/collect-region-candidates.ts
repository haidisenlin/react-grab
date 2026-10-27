import {
  REGION_MAX_CANDIDATES,
  REGION_MAX_SAMPLE_POINTS,
  REGION_NEIGHBOR_PROBE_DISTANCES_PX,
  REGION_SAMPLE_SPACING_PX,
} from "../constants.js";
import { getComponentDisplayName } from "../core/context.js";
import type { AxisRect } from "../types.js";
import { createElementBounds } from "./create-element-bounds.js";
import type { RegionLayoutCandidate } from "./describe-region-layout.js";
import { getComposedParentElement } from "./get-composed-parent-element.js";
import { getDeepElementsAtPoint } from "./get-deep-elements-at-point.js";
import { getTagName } from "./get-tag-name.js";
import { isReactGrabElement } from "./is-react-grab-element.js";
import { isValidGrabbableElement } from "./is-valid-grabbable-element.js";
import { suspendPointerEventsFreeze, resumePointerEventsFreeze } from "./pointer-events-freeze.js";

export interface CollectedRegionCandidate extends RegionLayoutCandidate {
  element: Element;
}

export interface CollectedRegionCandidates {
  ancestor: CollectedRegionCandidate | null;
  candidates: CollectedRegionCandidate[];
}

const clampSampleCount = (span: number): number => {
  const estimated = Math.ceil(span / REGION_SAMPLE_SPACING_PX);
  if (estimated < 2) return 2;
  if (estimated > 6) return 6;
  return estimated;
};

const pushSample = (samples: Array<{ x: number; y: number }>, x: number, y: number): void => {
  if (samples.length >= REGION_MAX_SAMPLE_POINTS) return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  samples.push({ x, y });
};

const collectSamplePoints = (region: AxisRect): Array<{ x: number; y: number }> => {
  const samples: Array<{ x: number; y: number }> = [];
  const columns = clampSampleCount(region.width);
  const rows = clampSampleCount(region.height);
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const x = region.x + (region.width * (columnIndex + 0.5)) / columns;
      const y = region.y + (region.height * (rowIndex + 0.5)) / rows;
      pushSample(samples, x, y);
    }
  }

  const midX = region.x + region.width / 2;
  const midY = region.y + region.height / 2;
  for (const distance of REGION_NEIGHBOR_PROBE_DISTANCES_PX) {
    pushSample(samples, midX, region.y - distance);
    pushSample(samples, midX, region.y + region.height + distance);
    pushSample(samples, region.x - distance, midY);
    pushSample(samples, region.x + region.width + distance, midY);
  }
  return samples;
};

const rectContains = (outer: AxisRect, inner: AxisRect): boolean =>
  outer.x <= inner.x &&
  outer.y <= inner.y &&
  outer.x + outer.width >= inner.x + inner.width &&
  outer.y + outer.height >= inner.y + inner.height;

const boundsOf = (element: Element): AxisRect => {
  const bounds = createElementBounds(element);
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
};

export const collectRegionCandidates = (region: AxisRect): CollectedRegionCandidates => {
  const candidates: CollectedRegionCandidate[] = [];
  const includedElements = new Set<Element>();
  let nextKey = 0;

  const addElement = (
    element: Element | null,
    allowUngrabbable: boolean,
  ): CollectedRegionCandidate | null => {
    if (!element || includedElements.has(element) || isReactGrabElement(element)) return null;
    if (!allowUngrabbable && !isValidGrabbableElement(element)) return null;
    if (candidates.length >= REGION_MAX_CANDIDATES && !allowUngrabbable) return null;
    const bounds = boundsOf(element);
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    includedElements.add(element);
    const candidate: CollectedRegionCandidate = {
      key: `region-candidate-${nextKey}`,
      label: getComponentDisplayName(element) ?? (getTagName(element) || "element"),
      bounds,
      selector: null,
      detail: null,
      element,
    };
    nextKey += 1;
    candidates.push(candidate);
    return candidate;
  };

  suspendPointerEventsFreeze();
  try {
    const centerX = region.x + region.width / 2;
    const centerY = region.y + region.height / 2;
    let ancestorElement = getDeepElementsAtPoint(centerX, centerY).find(
      (element) => !isReactGrabElement(element),
    );
    if (!ancestorElement) {
      ancestorElement = document.elementFromPoint(centerX, centerY) ?? undefined;
    }
    let currentElement = ancestorElement ?? null;
    let containingElement: Element | null = null;
    while (currentElement) {
      if (!isReactGrabElement(currentElement) && rectContains(boundsOf(currentElement), region)) {
        containingElement = currentElement;
        break;
      }
      currentElement = getComposedParentElement(currentElement);
    }
    if (!containingElement) containingElement = document.body;
    const ancestor = addElement(containingElement, true);

    for (const sample of collectSamplePoints(region)) {
      if (candidates.length >= REGION_MAX_CANDIDATES) break;
      for (const element of getDeepElementsAtPoint(sample.x, sample.y)) {
        addElement(element, false);
      }
    }

    if (containingElement) {
      for (const child of containingElement.children) {
        addElement(child, false);
        for (const grandchild of child.children) addElement(grandchild, false);
      }
    }

    return { ancestor, candidates };
  } finally {
    resumePointerEventsFreeze();
  }
};
