import { describe, expect, it } from "vite-plus/test";
import {
  buildCoordinateFrame,
  cssPointFromImagePixel,
  estimateBrowserZoom,
  formatCoordinateSummary,
  mapScreenRectToLocal,
  measureImageGeometry,
} from "../src/utils/coordinate-frame.js";
import type { CoordinateFrameSources } from "../src/utils/coordinate-frame.js";
import {
  cropPaddingForRect,
  mergeCropsToLimit,
  planCropForRects,
} from "../src/utils/plan-selection-captures.js";

const viewportSources = (devicePixelRatio: number): CoordinateFrameSources => ({
  viewportWidth: 1440,
  viewportHeight: 900,
  visualViewport: {
    scale: 1,
    offsetLeft: 0,
    offsetTop: 0,
    width: 1440,
    height: 900,
  },
  documentWidth: 1440,
  documentHeight: 2400,
  scrollX: 0,
  scrollY: 120,
  devicePixelRatio,
  scrollContainers: [],
  ancestorTransforms: [],
  screenRect: { x: 100, y: 80, width: 40, height: 20 },
});

describe("coordinate frame", () => {
  it("reports DPR 1 with an estimated 100% zoom", () => {
    const frame = buildCoordinateFrame(viewportSources(1));
    expect(frame.devicePixelRatio).toBe(1);
    expect(frame.browserZoom).toEqual({ ratio: 1, percent: 100, estimate: true });
    expect(frame.summary).toBe("viewport 1440×900 css px, DPR 1, zoom ~100%");
    expect(estimateBrowserZoom(1440, 1440).estimate).toBe(true);
  });

  it("reports DPR 2 without treating the display scale as browser zoom", () => {
    const frame = buildCoordinateFrame(viewportSources(2));
    expect(frame.summary).toBe("viewport 1440×900 css px, DPR 2, zoom ~100%");
    expect(frame.localRect).toEqual(frame.screenRect);
    expect(formatCoordinateSummary(1440, 900, 2, frame.browserZoom)).toBe(frame.summary);
  });

  it("maps a region into a transformed ancestor at DPR 2", () => {
    const sources = viewportSources(2);
    sources.ancestorTransforms = [
      {
        label: "Canvas",
        scaleX: 2,
        scaleY: 2,
        translateX: 10,
        translateY: 20,
        screenRect: { x: 0, y: 0, width: 400, height: 300 },
      },
    ];
    const frame = buildCoordinateFrame(sources);
    expect(frame.summary).toBe("viewport 1440×900 css px, DPR 2, zoom ~100%");
    expect(frame.localRect).toEqual(
      mapScreenRectToLocal(sources.screenRect, sources.ancestorTransforms[0].screenRect, 2, 2),
    );
    expect(frame.localRect).toEqual({ x: 50, y: 40, width: 20, height: 10 });
    expect(frame.ancestorTransforms[0]?.translateX).toBe(10);
  });
});

describe("selection image geometry", () => {
  it("keeps DPR 1 and DPR 2 scales so css = origin + px/scale", () => {
    const cssRect = { x: 10, y: 20, width: 200, height: 100 };
    const atDpr1 = measureImageGeometry(cssRect, 1, 1024);
    const atDpr2 = measureImageGeometry(cssRect, 2, 1024);
    expect(atDpr1).toMatchObject({ pixelWidth: 200, pixelHeight: 100, scale: 1 });
    expect(atDpr2).toMatchObject({ pixelWidth: 400, pixelHeight: 200, scale: 2 });
    expect(
      cssPointFromImagePixel({ x: cssRect.x, y: cssRect.y }, { x: 20, y: 10 }, atDpr2.scale),
    ).toEqual({
      x: 20,
      y: 25,
    });
  });

  it("includes downscale in the css-per-pixel scale", () => {
    const cssRect = { x: 0, y: 0, width: 800, height: 400 };
    const geometry = measureImageGeometry(cssRect, 2, 1024);
    expect(geometry.pixelWidth).toBe(1024);
    expect(geometry.pixelHeight).toBe(512);
    expect(geometry.scale).toBeCloseTo(1024 / 800);
    expect(cssPointFromImagePixel({ x: 0, y: 0 }, { x: 1024, y: 512 }, geometry.scale)).toEqual({
      x: 800,
      y: 400,
    });
  });
});

describe("selection crops", () => {
  const visibleRect = { x: 0, y: 0, width: 1440, height: 900 };

  it("clamps padding and snaps to a nearby component ancestor", () => {
    expect(cropPaddingForRect({ x: 0, y: 0, width: 20, height: 10 })).toBe(48);
    expect(cropPaddingForRect({ x: 0, y: 0, width: 100, height: 40 })).toBe(50);
    expect(cropPaddingForRect({ x: 0, y: 0, width: 1000, height: 100 })).toBe(240);

    const snapped = planCropForRects({
      id: "crop-1",
      numbers: [1],
      targetIds: ["element-1"],
      rects: [{ x: 100, y: 100, width: 100, height: 100 }],
      snapAncestorRect: { x: 80, y: 80, width: 300, height: 300 },
      visibleRect,
    });
    expect(snapped.cropRect).toEqual({ x: 80, y: 80, width: 300, height: 300 });

    const unsnapped = planCropForRects({
      id: "crop-1",
      numbers: [1],
      targetIds: ["element-1"],
      rects: [{ x: 100, y: 100, width: 100, height: 100 }],
      snapAncestorRect: { x: 0, y: 0, width: 1000, height: 1000 },
      visibleRect,
    });
    expect(unsnapped.cropRect.width).toBe(200);
  });

  it("merges nearby crops down to six", () => {
    const crops = Array.from({ length: 7 }, (_, index) =>
      planCropForRects({
        id: `crop-${index + 1}`,
        numbers: [index + 1],
        targetIds: [`region-${index + 1}`],
        rects: [{ x: index * 30, y: 40, width: 20, height: 20 }],
        snapAncestorRect: null,
        visibleRect,
      }),
    );
    const merged = mergeCropsToLimit(crops, visibleRect, 6);
    expect(merged).toHaveLength(6);
    expect(merged.reduce((count, crop) => count + crop.numbers.length, 0)).toBe(7);
  });
});
