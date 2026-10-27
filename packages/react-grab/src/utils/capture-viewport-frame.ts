import {
  HIT_TEST_SHIELD_ATTRIBUTE,
  SELECTION_CAPTURE_MAX_DPR,
  SELECTION_CAPTURE_TIMEOUT_MS,
  SELECTION_MASK_ATTRIBUTE,
  SELECTION_MASK_BLUR_PX,
} from "../constants.js";
import type { AxisRect } from "../types.js";
import { isReactGrabElement } from "./is-react-grab-element.js";
import { loadCapturePlugin, readCapturePlugin } from "./load-capture-plugin.js";
import { REACT_GRAB_ATTRIBUTE_NAME } from "./react-grab-attribute-name.js";
import { readVisibleViewportRect } from "./read-coordinate-frame.js";

export interface ViewportFrame {
  canvas: HTMLCanvasElement;
  cssRect: AxisRect;
  devicePixelRatio: number;
  signature: string;
}

interface SnapdomCapture {
  toCanvas: (options?: { dpr?: number; scale?: number }) => Promise<HTMLCanvasElement>;
}

const viewportSignature = (): string => {
  const visualViewport = window.visualViewport;
  return [
    window.scrollX,
    window.scrollY,
    window.innerWidth,
    window.innerHeight,
    window.devicePixelRatio,
    visualViewport?.scale ?? 1,
    visualViewport?.offsetLeft ?? 0,
    visualViewport?.offsetTop ?? 0,
    visualViewport?.width ?? window.innerWidth,
    visualViewport?.height ?? window.innerHeight,
  ].join(":");
};

const hideGrabUi = (): Array<{ element: HTMLElement; visibility: string }> => {
  const hidden: Array<{ element: HTMLElement; visibility: string }> = [];
  const nodes = document.querySelectorAll(
    `[${REACT_GRAB_ATTRIBUTE_NAME}], [${HIT_TEST_SHIELD_ATTRIBUTE}]`,
  );
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    hidden.push({ element: node, visibility: node.style.visibility });
    node.style.visibility = "hidden";
  }
  return hidden;
};

const restoreGrabUi = (hidden: Array<{ element: HTMLElement; visibility: string }>) => {
  for (const entry of hidden) entry.element.style.visibility = entry.visibility;
};

const blurMaskedElements = (canvas: HTMLCanvasElement, cssRect: AxisRect) => {
  const context = canvas.getContext("2d");
  if (!context) return;
  const scaleX = cssRect.width > 0 ? canvas.width / cssRect.width : 1;
  const scaleY = cssRect.height > 0 ? canvas.height / cssRect.height : 1;
  const masked = document.querySelectorAll(`[${SELECTION_MASK_ATTRIBUTE}]`);
  for (const node of masked) {
    if (!(node instanceof Element) || isReactGrabElement(node)) continue;
    const rect = node.getBoundingClientRect();
    const sourceX = (rect.left - cssRect.x) * scaleX;
    const sourceY = (rect.top - cssRect.y) * scaleY;
    const sourceWidth = Math.max(1, rect.width * scaleX);
    const sourceHeight = Math.max(1, rect.height * scaleY);
    if (sourceWidth < 1 || sourceHeight < 1) continue;
    const temporary = document.createElement("canvas");
    temporary.width = Math.ceil(sourceWidth);
    temporary.height = Math.ceil(sourceHeight);
    const temporaryContext = temporary.getContext("2d");
    if (!temporaryContext) continue;
    temporaryContext.drawImage(
      canvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      temporary.width,
      temporary.height,
    );
    context.save();
    context.filter = `blur(${SELECTION_MASK_BLUR_PX * scaleX}px)`;
    context.drawImage(temporary, sourceX, sourceY, sourceWidth, sourceHeight);
    context.restore();
  }
};

const captureWithSnapdom = async (dpr: number): Promise<HTMLCanvasElement | null> => {
  try {
    const snapdomModule = (await import("@zumer/snapdom")) as { snapdom?: unknown };
    if (typeof snapdomModule.snapdom !== "function") return null;
    const snapdom = snapdomModule.snapdom as (
      element: Element,
      options?: Record<string, unknown>,
    ) => Promise<SnapdomCapture>;
    const capture = await snapdom(document.documentElement, {
      clip: "viewport",
      dpr,
      scale: 1,
      embedFonts: false,
      fast: true,
      cache: "disabled",
      exclude: (node: Node) => node instanceof Element && isReactGrabElement(node),
      excludeMode: "hide",
    });
    return await capture.toCanvas({ dpr, scale: 1 });
  } catch {
    return null;
  }
};

const captureWithHtmlToImage = async (
  dpr: number,
  cssRect: AxisRect,
): Promise<HTMLCanvasElement | null> => {
  try {
    const htmlToImage = (await import("html-to-image")) as {
      toCanvas?: (
        node: HTMLElement,
        options?: Record<string, unknown>,
      ) => Promise<HTMLCanvasElement>;
    };
    if (!htmlToImage.toCanvas) return null;
    return await htmlToImage.toCanvas(document.documentElement, {
      pixelRatio: dpr,
      width: cssRect.width,
      height: cssRect.height,
      canvasWidth: Math.round(cssRect.width * dpr),
      canvasHeight: Math.round(cssRect.height * dpr),
      filter: (node: Node) => !(node instanceof Element && isReactGrabElement(node)),
    });
  } catch {
    return null;
  }
};

const withTimeout = async <T>(promise: Promise<T>): Promise<T | null> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then((value) => value),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), SELECTION_CAPTURE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

export const captureViewportFrame = async (): Promise<ViewportFrame | null> => {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const cssRect = readVisibleViewportRect();
  const devicePixelRatio = Math.min(window.devicePixelRatio || 1, SELECTION_CAPTURE_MAX_DPR);
  const signature = viewportSignature();
  const hiddenUi = hideGrabUi();
  try {
    const bundledCanvas = await withTimeout(
      (async () =>
        (await captureWithSnapdom(devicePixelRatio)) ??
        (await captureWithHtmlToImage(devicePixelRatio, cssRect)))(),
    );
    const plugin = bundledCanvas
      ? null
      : (readCapturePlugin() ?? ((await loadCapturePlugin()) ? readCapturePlugin() : null));
    const canvas =
      bundledCanvas ??
      (plugin
        ? await withTimeout(
            (async () =>
              (await plugin.captureWithSnapdom(devicePixelRatio)) ??
              (await plugin.captureWithHtmlToImage(
                devicePixelRatio,
                cssRect.width,
                cssRect.height,
              )))(),
          )
        : null);
    if (!canvas) return null;
    blurMaskedElements(canvas, cssRect);
    return { canvas, cssRect, devicePixelRatio, signature };
  } finally {
    restoreGrabUi(hiddenUi);
  }
};

export const currentViewportSignature = (): string =>
  typeof window === "undefined" ? "" : viewportSignature();
