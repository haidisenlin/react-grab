import { getComponentDisplayName } from "../core/context.js";
import type { AxisRect } from "../types.js";
import { collectRegionCandidates } from "./collect-region-candidates.js";
import { createElementSelector } from "./create-element-selector.js";
import { describeRegionLayout } from "./describe-region-layout.js";
import { findSelectorTarget } from "./find-selector-target.js";
import { getTagName } from "./get-tag-name.js";

export interface RegionOverlap {
  key: string;
  element: Element;
  label: string;
  selector: string | null;
  regionCoverage: number;
  elementCoverage: number;
}

const readSelector = (element: Element): string | null => {
  try {
    const selector = createElementSelector(findSelectorTarget(element));
    return selector || null;
  } catch {
    return null;
  }
};

export const listRegionOverlaps = (region: AxisRect): RegionOverlap[] => {
  const collected = collectRegionCandidates(region);
  const layout = describeRegionLayout(region, collected.candidates);
  const overlaps: RegionOverlap[] = [];
  for (const candidate of layout.intersecting) {
    const source = collected.candidates.find((item) => item.key === candidate.key);
    if (!source) continue;
    overlaps.push({
      key: candidate.key,
      element: source.element,
      label:
        getComponentDisplayName(source.element) ?? getTagName(source.element) ?? candidate.label,
      selector: readSelector(source.element),
      regionCoverage: candidate.regionCoverage ?? 0,
      elementCoverage: candidate.elementCoverage ?? 0,
    });
  }
  return overlaps;
};
