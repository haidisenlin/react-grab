import {
  CAPTURE_IIFE_FILENAME,
  CAPTURE_SCRIPT_ATTRIBUTE,
  CAPTURE_SCRIPT_SRC_ATTRIBUTE,
  CAPTURE_SCRIPT_TIMEOUT_MS,
  REACT_GRAB_IIFE_FILENAME,
} from "../constants.js";
import type { ReactGrabCapturePlugin } from "../capture-plugin-contract.js";

export const readCapturePlugin = (): ReactGrabCapturePlugin | null => {
  const plugin = globalThis.__REACT_GRAB_CAPTURE__;
  if (!plugin) return null;
  if (typeof plugin.captureWithSnapdom !== "function") return null;
  if (typeof plugin.captureWithHtmlToImage !== "function") return null;
  return plugin;
};

const captureScriptUrlFromPage = (): string | null => {
  const configured = globalThis.__REACT_GRAB_CAPTURE_SRC__;
  if (typeof configured === "string" && configured.length > 0) return configured;
  if (typeof document === "undefined") return null;
  const scripts = document.querySelectorAll("script[src]");
  for (const script of scripts) {
    if (!(script instanceof HTMLScriptElement)) continue;
    const explicitSource = script.getAttribute(CAPTURE_SCRIPT_SRC_ATTRIBUTE);
    if (explicitSource) return new URL(explicitSource, script.src).toString();
    const sourceUrl = new URL(script.src, window.location.href);
    if (!sourceUrl.pathname.endsWith(REACT_GRAB_IIFE_FILENAME)) continue;
    sourceUrl.pathname = `${sourceUrl.pathname.slice(0, -REACT_GRAB_IIFE_FILENAME.length)}${CAPTURE_IIFE_FILENAME}`;
    return sourceUrl.toString();
  }
  return null;
};

let loadingPlugin: Promise<boolean> | null = null;

const waitForCaptureScript = (script: HTMLScriptElement): Promise<boolean> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), CAPTURE_SCRIPT_TIMEOUT_MS);
    script.addEventListener("load", () => {
      clearTimeout(timer);
      resolve(readCapturePlugin() !== null);
    });
    script.addEventListener("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });

export const loadCapturePlugin = (): Promise<boolean> => {
  if (readCapturePlugin()) return Promise.resolve(true);
  if (loadingPlugin) return loadingPlugin;
  if (typeof document === "undefined") return Promise.resolve(false);
  const source = captureScriptUrlFromPage();
  if (!source) return Promise.resolve(false);
  loadingPlugin = (async () => {
    const existing = document.querySelector(`script[${CAPTURE_SCRIPT_ATTRIBUTE}]`);
    if (existing instanceof HTMLScriptElement) {
      if (readCapturePlugin()) return true;
      return waitForCaptureScript(existing);
    }
    const script = document.createElement("script");
    script.src = source;
    script.async = true;
    script.setAttribute(CAPTURE_SCRIPT_ATTRIBUTE, "");
    const loaded = waitForCaptureScript(script);
    document.head.append(script);
    return loaded;
  })();
  return loadingPlugin;
};
