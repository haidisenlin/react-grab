import { snapdom } from "@zumer/snapdom";
import { toCanvas } from "html-to-image";
import type { ReactGrabCapturePlugin } from "./capture-plugin-contract.js";
import { isReactGrabElement } from "./utils/is-react-grab-element.js";

const excludeGrabUi = (node: Node): boolean => node instanceof Element && isReactGrabElement(node);

const captureWithSnapdom = async (devicePixelRatio: number): Promise<HTMLCanvasElement | null> => {
  try {
    const capture = await snapdom(document.documentElement, {
      clip: "viewport",
      dpr: devicePixelRatio,
      scale: 1,
      embedFonts: false,
      fast: true,
      cache: "disabled",
      exclude: excludeGrabUi,
      excludeMode: "hide",
    });
    return await capture.toCanvas({ dpr: devicePixelRatio, scale: 1 });
  } catch {
    return null;
  }
};

const captureWithHtmlToImage = async (
  devicePixelRatio: number,
  cssWidth: number,
  cssHeight: number,
): Promise<HTMLCanvasElement | null> => {
  try {
    return await toCanvas(document.documentElement, {
      pixelRatio: devicePixelRatio,
      width: cssWidth,
      height: cssHeight,
      canvasWidth: Math.round(cssWidth * devicePixelRatio),
      canvasHeight: Math.round(cssHeight * devicePixelRatio),
      filter: (node) => !excludeGrabUi(node),
    });
  } catch {
    return null;
  }
};

const plugin: ReactGrabCapturePlugin = {
  captureWithSnapdom,
  captureWithHtmlToImage,
};

globalThis.__REACT_GRAB_CAPTURE__ = plugin;
