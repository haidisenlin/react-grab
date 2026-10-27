import { REGION_CONTAIN_EPSILON_PX, REGION_MAX_INTERSECTING_ELEMENTS } from "../constants.js";
import type { AxisRect } from "../types.js";

export type RegionDirection = "above" | "below" | "left" | "right";

export interface RegionLayoutCandidate {
  key: string;
  label: string;
  bounds: AxisRect;
  selector: string | null;
  detail: string | null;
  regionCoverage?: number;
  elementCoverage?: number;
}

export interface RegionNeighbor {
  direction: RegionDirection;
  distancePx: number;
  candidate: RegionLayoutCandidate;
}

export interface RegionLayout {
  ancestor: RegionLayoutCandidate | null;
  intersecting: RegionLayoutCandidate[];
  neighbors: RegionNeighbor[];
  isEmpty: boolean;
}

const containsRect = (outer: AxisRect, inner: AxisRect): boolean =>
  outer.x <= inner.x + REGION_CONTAIN_EPSILON_PX &&
  outer.y <= inner.y + REGION_CONTAIN_EPSILON_PX &&
  outer.x + outer.width >= inner.x + inner.width - REGION_CONTAIN_EPSILON_PX &&
  outer.y + outer.height >= inner.y + inner.height - REGION_CONTAIN_EPSILON_PX;

const intersectsRect = (first: AxisRect, second: AxisRect): boolean =>
  first.x < second.x + second.width &&
  first.x + first.width > second.x &&
  first.y < second.y + second.height &&
  first.y + first.height > second.y;

const areaOf = (rect: AxisRect): number => Math.max(0, rect.width) * Math.max(0, rect.height);

const intersectionArea = (first: AxisRect, second: AxisRect): number => {
  const width =
    Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x);
  const height =
    Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y);
  if (width <= 0 || height <= 0) return 0;
  return width * height;
};

interface DirectionGap {
  direction: RegionDirection;
  distancePx: number;
}

const directionGap = (region: AxisRect, bounds: AxisRect): DirectionGap | null => {
  const gapLeft = region.x - (bounds.x + bounds.width);
  const gapRight = bounds.x - (region.x + region.width);
  const gapAbove = region.y - (bounds.y + bounds.height);
  const gapBelow = bounds.y - (region.y + region.height);
  const overlapsHorizontally = gapLeft <= 0 && gapRight <= 0;
  const overlapsVertically = gapAbove <= 0 && gapBelow <= 0;
  if (overlapsHorizontally && overlapsVertically) return null;

  if (overlapsHorizontally && gapAbove > 0) {
    return { direction: "above", distancePx: gapAbove };
  }
  if (overlapsHorizontally && gapBelow > 0) {
    return { direction: "below", distancePx: gapBelow };
  }
  if (overlapsVertically && gapLeft > 0) {
    return { direction: "left", distancePx: gapLeft };
  }
  if (overlapsVertically && gapRight > 0) {
    return { direction: "right", distancePx: gapRight };
  }

  const verticalDistance = gapAbove > 0 ? gapAbove : gapBelow;
  const horizontalDistance = gapLeft > 0 ? gapLeft : gapRight;
  if (verticalDistance <= horizontalDistance) {
    return {
      direction: gapAbove > 0 ? "above" : "below",
      distancePx: verticalDistance,
    };
  }
  return {
    direction: gapLeft > 0 ? "left" : "right",
    distancePx: horizontalDistance,
  };
};

export const describeRegionLayout = (
  region: AxisRect,
  candidates: readonly RegionLayoutCandidate[],
): RegionLayout => {
  let ancestor: RegionLayoutCandidate | null = null;
  let ancestorArea = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (!containsRect(candidate.bounds, region)) continue;
    const candidateArea = areaOf(candidate.bounds);
    if (candidateArea < ancestorArea) {
      ancestor = candidate;
      ancestorArea = candidateArea;
    }
  }

  const intersecting: RegionLayoutCandidate[] = [];
  const nearestByDirection = new Map<RegionDirection, RegionNeighbor>();
  for (const candidate of candidates) {
    if (candidate === ancestor || candidate.key === ancestor?.key) continue;
    if (containsRect(candidate.bounds, region)) continue;
    if (intersectsRect(candidate.bounds, region)) {
      const regionArea = areaOf(region);
      const candidateArea = areaOf(candidate.bounds);
      const overlapArea = intersectionArea(region, candidate.bounds);
      candidate.regionCoverage = regionArea > 0 ? overlapArea / regionArea : 0;
      candidate.elementCoverage = candidateArea > 0 ? overlapArea / candidateArea : 0;
      intersecting.push(candidate);
      continue;
    }
    const gap = directionGap(region, candidate.bounds);
    if (!gap) continue;
    const distancePx = Math.round(gap.distancePx);
    const currentNeighbor = nearestByDirection.get(gap.direction);
    if (currentNeighbor && currentNeighbor.distancePx <= distancePx) continue;
    nearestByDirection.set(gap.direction, {
      direction: gap.direction,
      distancePx,
      candidate,
    });
  }

  intersecting.sort((first, second) => {
    const regionCoverageDelta = (second.regionCoverage ?? 0) - (first.regionCoverage ?? 0);
    if (regionCoverageDelta !== 0) return regionCoverageDelta;
    return (second.elementCoverage ?? 0) - (first.elementCoverage ?? 0);
  });

  return {
    ancestor,
    intersecting: intersecting.slice(0, REGION_MAX_INTERSECTING_ELEMENTS),
    neighbors: [...nearestByDirection.values()],
    isEmpty: intersecting.length === 0,
  };
};
