import type { AxisRect, RegionAnchor, RegionMeasurement } from "../types.js";

export interface RegionMeasurementInput {
  anchor: RegionAnchor;
  viewport: AxisRect;
  scrollX: number;
  scrollY: number;
  viewportWidth: number;
  viewportHeight: number;
  documentWidth: number;
  documentHeight: number;
}

const percentOf = (value: number, total: number): number =>
  total > 0 ? Math.round((value / total) * 100) : 0;

const percentRect = (rect: AxisRect, width: number, height: number): AxisRect => ({
  x: percentOf(rect.x, width),
  y: percentOf(rect.y, height),
  width: percentOf(rect.width, width),
  height: percentOf(rect.height, height),
});

export const measureRegionRect = (input: RegionMeasurementInput): RegionMeasurement => {
  const page: AxisRect = {
    x: input.viewport.x + input.scrollX,
    y: input.viewport.y + input.scrollY,
    width: input.viewport.width,
    height: input.viewport.height,
  };
  return {
    anchor: input.anchor,
    viewport: input.viewport,
    page,
    viewportPercent: percentRect(input.viewport, input.viewportWidth, input.viewportHeight),
    documentPercent: percentRect(page, input.documentWidth, input.documentHeight),
  };
};
