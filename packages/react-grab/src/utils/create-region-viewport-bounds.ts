import type { OverlayBounds, RegionAnchor } from "../types.js";

export interface RegionGeometry {
  anchor: RegionAnchor;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const createRegionViewportBounds = (region: RegionGeometry): OverlayBounds => ({
  borderRadius: "0px",
  height: region.height,
  width: region.width,
  x: region.anchor === "viewport" ? region.x : region.x - window.scrollX,
  y: region.anchor === "viewport" ? region.y : region.y - window.scrollY,
});
