import { getComponentDisplayName, resolveElementReferenceContext } from "../core/context.js";
import type { RegionAnchor, RegionSelectionPayload } from "../types.js";
import { collectRegionCandidates } from "./collect-region-candidates.js";
import type { CollectedRegionCandidate } from "./collect-region-candidates.js";
import { createElementSelector } from "./create-element-selector.js";
import { createRegionViewportBounds } from "./create-region-viewport-bounds.js";
import { describeRegionLayout } from "./describe-region-layout.js";
import type { RegionLayoutCandidate } from "./describe-region-layout.js";
import { findSelectorTarget } from "./find-selector-target.js";
import { formatRegionContext } from "./format-region-context.js";
import { measureRegionRect } from "./measure-region-rect.js";
import { readCoordinateFrame } from "./read-coordinate-frame.js";

export interface RegionContextSource {
  id: string;
  anchor: RegionAnchor;
  x: number;
  y: number;
  width: number;
  height: number;
  note?: string;
}

export interface BuiltRegionContext {
  text: string;
  payload: RegionSelectionPayload;
  ancestorElement: Element | null;
}

const documentSpan = (): { width: number; height: number } => {
  const root = document.documentElement;
  const body = document.body;
  return {
    width: Math.max(root.scrollWidth, root.clientWidth, body?.scrollWidth ?? 0),
    height: Math.max(root.scrollHeight, root.clientHeight, body?.scrollHeight ?? 0),
  };
};

const readSelector = (element: Element): string | null => {
  try {
    const selector = createElementSelector(findSelectorTarget(element));
    return selector || null;
  } catch {
    return null;
  }
};

const enrichCandidate = async (
  candidate: CollectedRegionCandidate | null,
  shouldResolveReference: boolean,
  maxLines: number | undefined,
): Promise<void> => {
  if (!candidate) return;
  candidate.selector = readSelector(candidate.element);
  if (!shouldResolveReference) return;
  try {
    const reference = await resolveElementReferenceContext(candidate.element, { maxLines });
    if (reference.componentName) candidate.label = reference.componentName;
    candidate.detail = reference.referenceContext || null;
  } catch {
    candidate.detail = null;
  }
};

const toLayoutCandidate = (candidate: CollectedRegionCandidate): RegionLayoutCandidate => candidate;

export const buildRegionContext = async (
  region: RegionContextSource,
  maxLines?: number,
): Promise<BuiltRegionContext> => {
  const viewportBounds = createRegionViewportBounds(region);
  const viewport = {
    x: viewportBounds.x,
    y: viewportBounds.y,
    width: viewportBounds.width,
    height: viewportBounds.height,
  };
  const documentSize = documentSpan();
  const measurement = measureRegionRect({
    anchor: region.anchor,
    viewport,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    documentWidth: documentSize.width,
    documentHeight: documentSize.height,
  });
  const note = region.note ?? "";

  try {
    const collected = collectRegionCandidates(viewport);
    const layout = describeRegionLayout(viewport, collected.candidates.map(toLayoutCandidate));
    const ancestor =
      collected.candidates.find((candidate) => candidate.key === layout.ancestor?.key) ?? null;
    await enrichCandidate(ancestor, true, maxLines);
    for (const candidate of layout.intersecting) {
      const collectedCandidate = collected.candidates.find((item) => item.key === candidate.key);
      await enrichCandidate(collectedCandidate ?? null, false, maxLines);
    }
    for (const neighbor of layout.neighbors) {
      const collectedCandidate = collected.candidates.find(
        (item) => item.key === neighbor.candidate.key,
      );
      await enrichCandidate(collectedCandidate ?? null, false, maxLines);
    }
    if (ancestor && layout.ancestor) {
      layout.ancestor.label = ancestor.label;
      layout.ancestor.selector = ancestor.selector;
      layout.ancestor.detail = ancestor.detail;
    }
    const coordinateFrame = readCoordinateFrame({
      element: ancestor?.element ?? null,
      screenRect: viewport,
      labelFor: (element) => getComponentDisplayName(element),
    });
    const text = formatRegionContext({ measurement, layout, note, coordinateFrame });
    return {
      text,
      ancestorElement: ancestor?.element ?? null,
      payload: {
        type: "region",
        id: region.id,
        text,
        note: note.trim(),
        isEmpty: layout.isEmpty,
        anchor: region.anchor,
        measurement,
        ancestorLabel: layout.ancestor?.label ?? null,
        ancestorSelector: layout.ancestor?.selector ?? null,
        coordinateFrame,
      },
    };
  } catch {
    const coordinateFrame = readCoordinateFrame({ screenRect: viewport });
    const text = formatRegionContext({
      measurement,
      layout: { ancestor: null, intersecting: [], neighbors: [], isEmpty: true },
      note,
      coordinateFrame,
    });
    return {
      text,
      ancestorElement: null,
      payload: {
        type: "region",
        id: region.id,
        text,
        note: note.trim(),
        isEmpty: true,
        anchor: region.anchor,
        measurement,
        ancestorLabel: null,
        ancestorSelector: null,
        coordinateFrame,
      },
    };
  }
};
