import {
  REGION_CONTAIN_EPSILON_PX,
  SELECTION_ANCESTOR_AREA_RATIO_MAX,
  SELECTION_CROP_MAX_COUNT,
  SELECTION_CROP_PADDING_MAX_PX,
  SELECTION_CROP_PADDING_MIN_PX,
  SELECTION_CROP_PADDING_RATIO,
} from "../constants.js";
import type { AxisRect } from "../types.js";

export interface PlannedCrop {
  id: string;
  numbers: number[];
  targetIds: string[];
  cropRect: AxisRect;
  regionRects: AxisRect[];
}

const areaOf = (rect: AxisRect): number => Math.max(0, rect.width) * Math.max(0, rect.height);

const clampNumber = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const cropPaddingForRect = (rect: AxisRect): number =>
  clampNumber(
    SELECTION_CROP_PADDING_RATIO * Math.max(rect.width, rect.height),
    SELECTION_CROP_PADDING_MIN_PX,
    SELECTION_CROP_PADDING_MAX_PX,
  );

export const expandRect = (rect: AxisRect, padding: number): AxisRect => ({
  x: rect.x - padding,
  y: rect.y - padding,
  width: rect.width + padding * 2,
  height: rect.height + padding * 2,
});

export const unionRects = (rects: readonly AxisRect[]): AxisRect => {
  const first = rects[0];
  if (!first) return { x: 0, y: 0, width: 0, height: 0 };
  let left = first.x;
  let top = first.y;
  let right = first.x + first.width;
  let bottom = first.y + first.height;
  for (const rect of rects) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
};

export const clampRectToVisible = (rect: AxisRect, visibleRect: AxisRect): AxisRect => {
  const left = Math.max(rect.x, visibleRect.x);
  const top = Math.max(rect.y, visibleRect.y);
  const right = Math.min(rect.x + rect.width, visibleRect.x + visibleRect.width);
  const bottom = Math.min(rect.y + rect.height, visibleRect.y + visibleRect.height);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
};

const containsRect = (outer: AxisRect, inner: AxisRect): boolean =>
  outer.x <= inner.x + REGION_CONTAIN_EPSILON_PX &&
  outer.y <= inner.y + REGION_CONTAIN_EPSILON_PX &&
  outer.x + outer.width >= inner.x + inner.width - REGION_CONTAIN_EPSILON_PX &&
  outer.y + outer.height >= inner.y + inner.height - REGION_CONTAIN_EPSILON_PX;

export const planCropForRects = (input: {
  id: string;
  numbers: number[];
  targetIds: string[];
  rects: readonly AxisRect[];
  snapAncestorRect: AxisRect | null;
  visibleRect: AxisRect;
}): PlannedCrop => {
  const regionRect = unionRects(input.rects);
  const padded = expandRect(regionRect, cropPaddingForRect(regionRect));
  const ancestor = input.snapAncestorRect;
  const snapped =
    ancestor &&
    containsRect(ancestor, regionRect) &&
    areaOf(ancestor) <= areaOf(padded) * SELECTION_ANCESTOR_AREA_RATIO_MAX
      ? ancestor
      : padded;
  return {
    id: input.id,
    numbers: input.numbers,
    targetIds: input.targetIds,
    cropRect: clampRectToVisible(snapped, input.visibleRect),
    regionRects: [...input.rects],
  };
};

const rectGap = (first: AxisRect, second: AxisRect): number => {
  const gapX = Math.max(
    0,
    Math.max(first.x, second.x) - Math.min(first.x + first.width, second.x + second.width),
  );
  const gapY = Math.max(
    0,
    Math.max(first.y, second.y) - Math.min(first.y + first.height, second.y + second.height),
  );
  return Math.hypot(gapX, gapY);
};

export const mergeCropsToLimit = (
  crops: readonly PlannedCrop[],
  visibleRect: AxisRect,
  limit = SELECTION_CROP_MAX_COUNT,
): PlannedCrop[] => {
  const pending = crops.map((crop) => ({
    ...crop,
    numbers: [...crop.numbers],
    regionRects: [...crop.regionRects],
    targetIds: [...crop.targetIds],
  }));
  while (pending.length > limit) {
    let pairIndex = 0;
    let closestIndex = 1;
    let closestGap = Number.POSITIVE_INFINITY;
    let closestArea = Number.POSITIVE_INFINITY;
    for (let firstIndex = 0; firstIndex < pending.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < pending.length; secondIndex += 1) {
        const firstCrop = pending[firstIndex];
        const secondCrop = pending[secondIndex];
        if (!firstCrop || !secondCrop) continue;
        const gap = rectGap(firstCrop.cropRect, secondCrop.cropRect);
        const combinedArea = areaOf(unionRects([firstCrop.cropRect, secondCrop.cropRect]));
        if (gap < closestGap || (gap === closestGap && combinedArea < closestArea)) {
          pairIndex = firstIndex;
          closestIndex = secondIndex;
          closestGap = gap;
          closestArea = combinedArea;
        }
      }
    }
    const firstCrop = pending[pairIndex];
    const secondCrop = pending[closestIndex];
    if (!firstCrop || !secondCrop) break;
    const merged = planCropForRects({
      id: firstCrop.id,
      numbers: [...firstCrop.numbers, ...secondCrop.numbers],
      targetIds: [...firstCrop.targetIds, ...secondCrop.targetIds],
      rects: [...firstCrop.regionRects, ...secondCrop.regionRects],
      snapAncestorRect: null,
      visibleRect,
    });
    merged.cropRect = clampRectToVisible(
      unionRects([firstCrop.cropRect, secondCrop.cropRect]),
      visibleRect,
    );
    pending.splice(closestIndex, 1);
    pending.splice(pairIndex, 1, merged);
  }
  return pending;
};
