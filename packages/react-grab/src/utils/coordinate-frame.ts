import { SELECTION_CAPTURE_MAX_DPR, SELECTION_IMAGE_TOKEN_DIVISOR_PX } from "../constants.js";
import type {
  AncestorTransformFrame,
  AxisRect,
  BrowserZoomEstimate,
  CoordinateFrame,
  ScrollContainerFrame,
  VisualViewportFrame,
} from "../types.js";

export interface CoordinateFrameSources {
  viewportWidth: number;
  viewportHeight: number;
  visualViewport: VisualViewportFrame | null;
  documentWidth: number;
  documentHeight: number;
  scrollX: number;
  scrollY: number;
  devicePixelRatio: number;
  scrollContainers: readonly ScrollContainerFrame[];
  ancestorTransforms: readonly AncestorTransformFrame[];
  screenRect: AxisRect;
}

// Browser zoom is not exposed on the web platform. devicePixelRatio mixes the
// display scale with Chromium's page zoom, so it is reported separately.
// visualViewport.width shrinks against the layout viewport while pinch-zooming,
// which is the only ratio we can observe. The result stays flagged as an estimate.
export const estimateBrowserZoom = (
  layoutWidth: number,
  visualViewportWidth: number | null,
): BrowserZoomEstimate => {
  const ratio =
    visualViewportWidth !== null && visualViewportWidth > 0 && layoutWidth > 0
      ? layoutWidth / visualViewportWidth
      : 1;
  return {
    ratio,
    percent: Math.round(ratio * 100),
    estimate: true,
  };
};

export const formatDevicePixelRatio = (devicePixelRatio: number): string => {
  const rounded = Math.round(devicePixelRatio * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

export const formatCoordinateSummary = (
  viewportWidth: number,
  viewportHeight: number,
  devicePixelRatio: number,
  browserZoom: BrowserZoomEstimate,
): string =>
  `viewport ${Math.round(viewportWidth)}×${Math.round(viewportHeight)} css px, DPR ${formatDevicePixelRatio(devicePixelRatio)}, zoom ~${browserZoom.percent}%`;

export const mapScreenRectToLocal = (
  screenRect: AxisRect,
  ancestorScreenRect: AxisRect,
  scaleX: number,
  scaleY: number,
): AxisRect => {
  const safeScaleX = scaleX === 0 ? 1 : scaleX;
  const safeScaleY = scaleY === 0 ? 1 : scaleY;
  return {
    x: (screenRect.x - ancestorScreenRect.x) / safeScaleX,
    y: (screenRect.y - ancestorScreenRect.y) / safeScaleY,
    width: screenRect.width / safeScaleX,
    height: screenRect.height / safeScaleY,
  };
};

const roundAxis = (value: number): string => String(Math.round(value));

const formatRect = (rect: AxisRect): string =>
  `x=${roundAxis(rect.x)} y=${roundAxis(rect.y)} ${roundAxis(rect.width)}×${roundAxis(rect.height)}`;

export const buildCoordinateFrame = (sources: CoordinateFrameSources): CoordinateFrame => {
  const browserZoom = estimateBrowserZoom(
    sources.viewportWidth,
    sources.visualViewport?.width ?? null,
  );
  const nearestTransform = sources.ancestorTransforms[0] ?? null;
  const localRect = nearestTransform
    ? mapScreenRectToLocal(
        sources.screenRect,
        nearestTransform.screenRect,
        nearestTransform.scaleX,
        nearestTransform.scaleY,
      )
    : sources.screenRect;
  return {
    summary: formatCoordinateSummary(
      sources.viewportWidth,
      sources.viewportHeight,
      sources.devicePixelRatio,
      browserZoom,
    ),
    viewport: { width: sources.viewportWidth, height: sources.viewportHeight },
    visualViewport: sources.visualViewport,
    document: {
      width: sources.documentWidth,
      height: sources.documentHeight,
      scrollX: sources.scrollX,
      scrollY: sources.scrollY,
    },
    devicePixelRatio: sources.devicePixelRatio,
    browserZoom,
    scrollContainers: [...sources.scrollContainers],
    ancestorTransforms: [...sources.ancestorTransforms],
    screenRect: sources.screenRect,
    localRect,
  };
};

export const formatCoordinateFrameText = (frame: CoordinateFrame): string => {
  const lines = [
    frame.summary,
    "coordinate-frame:",
    `  viewport: ${Math.round(frame.viewport.width)}×${Math.round(frame.viewport.height)} css px`,
  ];
  if (frame.visualViewport) {
    lines.push(
      `  visualViewport: scale=${frame.visualViewport.scale} offset=${Math.round(frame.visualViewport.offsetLeft)},${Math.round(frame.visualViewport.offsetTop)} size=${Math.round(frame.visualViewport.width)}×${Math.round(frame.visualViewport.height)}`,
    );
  } else {
    lines.push("  visualViewport: none");
  }
  lines.push(
    `  document: ${Math.round(frame.document.width)}×${Math.round(frame.document.height)} scroll=${Math.round(frame.document.scrollX)},${Math.round(frame.document.scrollY)}`,
    `  devicePixelRatio: ${formatDevicePixelRatio(frame.devicePixelRatio)}`,
    `  browserZoom: ~${frame.browserZoom.percent}% (estimate)`,
    `  screen: ${formatRect(frame.screenRect)} css px`,
    `  local: ${formatRect(frame.localRect)} untransformed px`,
  );
  if (frame.scrollContainers.length === 0) {
    lines.push("  scroll-containers: none");
  } else {
    lines.push("  scroll-containers:");
    for (const container of frame.scrollContainers) {
      lines.push(
        `    - ${container.label} rect ${formatRect(container.rect)} scroll=${Math.round(container.scrollLeft)},${Math.round(container.scrollTop)} size=${Math.round(container.scrollWidth)}×${Math.round(container.scrollHeight)}`,
      );
    }
  }
  if (frame.ancestorTransforms.length === 0) {
    lines.push("  ancestor-transforms: none");
  } else {
    lines.push("  ancestor-transforms:");
    for (const transform of frame.ancestorTransforms) {
      lines.push(
        `    - ${transform.label} scale=${transform.scaleX},${transform.scaleY} translate=${Math.round(transform.translateX)},${Math.round(transform.translateY)} screen ${formatRect(transform.screenRect)}`,
      );
    }
  }
  return lines.join("\n");
};

export const estimateImageTokens = (pixelWidth: number, pixelHeight: number): number =>
  Math.ceil(pixelWidth / SELECTION_IMAGE_TOKEN_DIVISOR_PX) *
  Math.ceil(pixelHeight / SELECTION_IMAGE_TOKEN_DIVISOR_PX);

export const cssPointFromImagePixel = (
  cssOrigin: { x: number; y: number },
  pixel: { x: number; y: number },
  scale: number,
): { x: number; y: number } => {
  const safeScale = scale === 0 ? 1 : scale;
  return {
    x: cssOrigin.x + pixel.x / safeScale,
    y: cssOrigin.y + pixel.y / safeScale,
  };
};

export const mapCssRectIntoImage = (
  cssRect: AxisRect,
  imageCssOrigin: AxisRect,
  scale: number,
): AxisRect => ({
  x: (cssRect.x - imageCssOrigin.x) * scale,
  y: (cssRect.y - imageCssOrigin.y) * scale,
  width: cssRect.width * scale,
  height: cssRect.height * scale,
});

export interface ImageGeometry {
  pixelWidth: number;
  pixelHeight: number;
  scale: number;
}

export const measureImageGeometry = (
  cssRect: AxisRect,
  devicePixelRatio: number,
  maxLongEdge: number,
): ImageGeometry => {
  const cappedDpr = Math.min(Math.max(devicePixelRatio, 1), SELECTION_CAPTURE_MAX_DPR);
  const fullWidth = cssRect.width * cappedDpr;
  const fullHeight = cssRect.height * cappedDpr;
  const longEdge = Math.max(fullWidth, fullHeight);
  const downscale = longEdge > maxLongEdge && longEdge > 0 ? maxLongEdge / longEdge : 1;
  const pixelWidth = Math.max(1, Math.round(fullWidth * downscale));
  const pixelHeight = Math.max(1, Math.round(fullHeight * downscale));
  const scale = cssRect.width > 0 ? pixelWidth / cssRect.width : cappedDpr;
  return { pixelWidth, pixelHeight, scale };
};

export const formatImageScaleLine = (image: {
  image_ref: string;
  css_rect: AxisRect;
  pixel_width: number;
  pixel_height: number;
  scale: number;
  token_estimate: number;
}): string =>
  `image ${image.image_ref}: css x=${Math.round(image.css_rect.x)} y=${Math.round(image.css_rect.y)} ${Math.round(image.css_rect.width)}×${Math.round(image.css_rect.height)} → ${image.pixel_width}×${image.pixel_height} px, scale ${Number(image.scale.toFixed(4))}, ~tokens ${image.token_estimate} (css = origin + px/scale)`;
