import {
  SELECTION_CROP_LONG_EDGE_PX,
  SELECTION_CROP_MAX_COUNT,
  SELECTION_OVERVIEW_LONG_EDGE_PX,
} from "../constants.js";
import { getComponentDisplayName } from "./context.js";
import type {
  AxisRect,
  CoordinateFrame,
  SelectionAnnotation,
  SelectionImageRecord,
  SelectionImageSet,
  SelectionZoomImage,
} from "../types.js";
import { captureViewportFrame, currentViewportSignature } from "../utils/capture-viewport-frame.js";
import type { ViewportFrame } from "../utils/capture-viewport-frame.js";
import {
  estimateImageTokens,
  formatImageScaleLine,
  mapCssRectIntoImage,
  measureImageGeometry,
} from "../utils/coordinate-frame.js";
import { drawAnnotatedImage } from "../utils/draw-selection-image.js";
import {
  mergeCropsToLimit,
  planCropForRects,
  unionRects,
} from "../utils/plan-selection-captures.js";
import type { PlannedCrop } from "../utils/plan-selection-captures.js";
import {
  readCommonComponentAncestorRect,
  readCoordinateFrame,
  readElementScreenRect,
  readNearestComponentAncestorRect,
} from "../utils/read-coordinate-frame.js";

export interface SelectionImageTarget {
  id: string;
  number: number;
  screenRect: AxisRect;
  element: Element | null;
  group: "elements" | "regions" | null;
}

const canvasRecord = async (
  canvas: HTMLCanvasElement,
  imageRef: string,
  cssRect: AxisRect,
  scale: number,
  coordinateFrame: CoordinateFrame,
): Promise<SelectionImageRecord | null> => {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((nextBlob) => resolve(nextBlob), "image/png");
  });
  if (!blob) return null;
  return {
    image_ref: imageRef,
    css_rect: cssRect,
    pixel_width: canvas.width,
    pixel_height: canvas.height,
    scale,
    token_estimate: estimateImageTokens(canvas.width, canvas.height),
    data_url: canvas.toDataURL("image/png"),
    blob,
    coordinate_frame: coordinateFrame,
  };
};

const isComponentElement = (element: Element): boolean => getComponentDisplayName(element) !== null;

const labelElement = (element: Element): string | null => getComponentDisplayName(element);

const planTargets = (
  targets: readonly SelectionImageTarget[],
  visibleRect: AxisRect,
): PlannedCrop[] => {
  const elementTargets = targets.filter((target) => target.group === "elements");
  const otherTargets = targets.filter((target) => target.group !== "elements");
  const crops: PlannedCrop[] = [];
  if (elementTargets.length === 1) {
    const target = elementTargets[0];
    if (target) {
      crops.push(
        planCropForRects({
          id: `crop-${target.number}`,
          numbers: [target.number],
          targetIds: [target.id],
          rects: [target.screenRect],
          snapAncestorRect: target.element
            ? readNearestComponentAncestorRect(target.element, isComponentElement)
            : null,
          visibleRect,
        }),
      );
    }
  } else if (elementTargets.length > 1) {
    const elements = elementTargets.flatMap((target) => (target.element ? [target.element] : []));
    crops.push(
      planCropForRects({
        id: "crop-elements",
        numbers: elementTargets.map((target) => target.number),
        targetIds: elementTargets.map((target) => target.id),
        rects: elementTargets.map((target) => target.screenRect),
        snapAncestorRect: readCommonComponentAncestorRect(elements, isComponentElement),
        visibleRect,
      }),
    );
  }
  for (const target of otherTargets) {
    crops.push(
      planCropForRects({
        id: `crop-${target.number}`,
        numbers: [target.number],
        targetIds: [target.id],
        rects: [target.screenRect],
        snapAncestorRect: target.element
          ? readNearestComponentAncestorRect(target.element, isComponentElement)
          : null,
        visibleRect,
      }),
    );
  }
  return mergeCropsToLimit(crops, visibleRect, SELECTION_CROP_MAX_COUNT);
};

const frameForRect = (rect: AxisRect, element: Element | null): CoordinateFrame | null =>
  readCoordinateFrame({
    element,
    screenRect: rect,
    labelFor: labelElement,
  });

export const formatSelectionImageLines = (images: SelectionImageSet): string =>
  [images.overview, ...images.crops].map((image) => formatImageScaleLine(image)).join("\n");

export const createSelectionImageSession = () => {
  let frame: ViewportFrame | null = null;
  let pendingCapture: Promise<ViewportFrame | null> | null = null;
  let latest: SelectionImageSet | null = null;
  const cropsById = new Map<string, PlannedCrop>();

  const capture = (): Promise<ViewportFrame | null> => {
    pendingCapture ??= captureViewportFrame()
      .then((nextFrame) => {
        frame = nextFrame;
        return nextFrame;
      })
      .finally(() => {
        pendingCapture = null;
      });
    return pendingCapture;
  };

  const ensureFrame = async (): Promise<ViewportFrame | null> => {
    if (frame && frame.signature === currentViewportSignature()) return frame;
    return capture();
  };

  const render = async (
    targets: readonly SelectionImageTarget[],
  ): Promise<SelectionImageSet | null> => {
    try {
      const nextFrame = await ensureFrame();
      if (!nextFrame || targets.length === 0) return null;
      const visibleRect = nextFrame.cssRect;
      const crops = planTargets(targets, visibleRect);
      const anchorElement = targets.find((target) => target.element)?.element ?? null;
      const overviewGeometry = measureImageGeometry(
        visibleRect,
        nextFrame.devicePixelRatio,
        SELECTION_OVERVIEW_LONG_EDGE_PX,
      );
      const overviewRegions = targets.map((target) => target.screenRect);
      const overviewCanvas = drawAnnotatedImage({
        frame: nextFrame.canvas,
        frameCssRect: visibleRect,
        cssRect: visibleRect,
        regionRects: overviewRegions,
        numbers: targets.map((target) => target.number),
        pixelWidth: overviewGeometry.pixelWidth,
        pixelHeight: overviewGeometry.pixelHeight,
        scale: overviewGeometry.scale,
      });
      const overviewFrame = frameForRect(visibleRect, anchorElement);
      if (!overviewCanvas || !overviewFrame) return null;
      const overview = await canvasRecord(
        overviewCanvas,
        "overview",
        visibleRect,
        overviewGeometry.scale,
        overviewFrame,
      );
      if (!overview) return null;
      const cropRecords: SelectionImageRecord[] = [];
      const annotations: SelectionAnnotation[] = [];
      cropsById.clear();
      for (const crop of crops) {
        const geometry = measureImageGeometry(
          crop.cropRect,
          nextFrame.devicePixelRatio,
          SELECTION_CROP_LONG_EDGE_PX,
        );
        const cropCanvas = drawAnnotatedImage({
          frame: nextFrame.canvas,
          frameCssRect: visibleRect,
          cssRect: crop.cropRect,
          regionRects: crop.regionRects,
          numbers: crop.numbers,
          pixelWidth: geometry.pixelWidth,
          pixelHeight: geometry.pixelHeight,
          scale: geometry.scale,
        });
        const regionUnion = unionRects(crop.regionRects);
        const cropFrame = frameForRect(regionUnion, anchorElement);
        if (!cropCanvas || !cropFrame) continue;
        const record = await canvasRecord(
          cropCanvas,
          crop.id,
          crop.cropRect,
          geometry.scale,
          cropFrame,
        );
        if (!record) continue;
        cropRecords.push(record);
        cropsById.set(crop.id, crop);
        for (const targetId of crop.targetIds) cropsById.set(targetId, crop);
        annotations.push({
          image_ref: crop.id,
          crop_rect_css: crop.cropRect,
          region_rect_in_crop_px: mapCssRectIntoImage(regionUnion, crop.cropRect, geometry.scale),
          scale: geometry.scale,
          overview_box_px: mapCssRectIntoImage(crop.cropRect, visibleRect, overviewGeometry.scale),
          token_estimate: record.token_estimate,
          pixel_width: record.pixel_width,
          pixel_height: record.pixel_height,
          numbers: crop.numbers,
          coordinate_frame: cropFrame,
        });
      }
      latest = { overview, crops: cropRecords, annotations };
      return latest;
    } catch {
      return null;
    }
  };

  const zoom = async (target: AxisRect | string): Promise<SelectionZoomImage | null> => {
    try {
      const nextFrame = await ensureFrame();
      if (!nextFrame) return null;
      const planned = typeof target === "string" ? cropsById.get(target) : null;
      const cssRect = typeof target === "string" ? planned?.cropRect : target;
      if (!cssRect || cssRect.width <= 0 || cssRect.height <= 0) return null;
      const geometry = measureImageGeometry(
        cssRect,
        nextFrame.devicePixelRatio,
        Number.POSITIVE_INFINITY,
      );
      const regionRects = planned?.regionRects ?? [cssRect];
      const numbers = planned?.numbers ?? [1];
      const canvas = drawAnnotatedImage({
        frame: nextFrame.canvas,
        frameCssRect: nextFrame.cssRect,
        cssRect,
        regionRects,
        numbers,
        pixelWidth: geometry.pixelWidth,
        pixelHeight: geometry.pixelHeight,
        scale: geometry.scale,
      });
      const coordinateFrame = frameForRect(unionRects(regionRects), null);
      if (!canvas || !coordinateFrame) return null;
      const record = await canvasRecord(
        canvas,
        typeof target === "string" ? target : "zoom",
        cssRect,
        geometry.scale,
        coordinateFrame,
      );
      return record;
    } catch {
      return null;
    }
  };

  return {
    capture,
    render,
    zoom,
    getLatest: () => latest,
    releaseFrame: () => {
      frame = null;
    },
  };
};

export const elementSelectionTargets = (elements: readonly Element[]): SelectionImageTarget[] =>
  elements.map((element, index) => ({
    id: `element-${index + 1}`,
    number: index + 1,
    screenRect: readElementScreenRect(element),
    element,
    group: "elements" as const,
  }));

export const regionSelectionTargets = (
  regions: readonly { id: string; screenRect: AxisRect; element?: Element | null }[],
): SelectionImageTarget[] =>
  regions.map((region, index) => ({
    id: region.id,
    number: index + 1,
    screenRect: region.screenRect,
    element: region.element ?? null,
    group: "regions" as const,
  }));
