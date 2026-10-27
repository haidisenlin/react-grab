import { SELECTION_BADGE_SIZE_PX, SELECTION_OUTLINE_PX } from "../constants.js";
import type { AxisRect } from "../types.js";
import { mapCssRectIntoImage } from "./coordinate-frame.js";

export interface AnnotatedImageInput {
  frame: HTMLCanvasElement;
  frameCssRect: AxisRect;
  cssRect: AxisRect;
  regionRects: readonly AxisRect[];
  numbers: readonly number[];
  pixelWidth: number;
  pixelHeight: number;
  scale: number;
}

const drawOutline = (
  context: CanvasRenderingContext2D,
  rect: AxisRect,
  numberLabel: string,
  scale: number,
) => {
  const lineWidth = Math.max(1, SELECTION_OUTLINE_PX * scale);
  context.save();
  context.strokeStyle = "#3b82f6";
  context.lineWidth = lineWidth;
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  const badgeSize = Math.max(12, SELECTION_BADGE_SIZE_PX * scale);
  let badgeX = rect.x;
  let badgeY = rect.y - badgeSize - lineWidth;
  if (badgeY < 0) badgeY = rect.y + lineWidth;
  if (badgeX < 0) badgeX = lineWidth;
  context.fillStyle = "#111827";
  context.beginPath();
  context.arc(badgeX + badgeSize / 2, badgeY + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = `${Math.max(10, Math.round(badgeSize * 0.62))}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(numberLabel, badgeX + badgeSize / 2, badgeY + badgeSize / 2);
  context.restore();
};

export const drawAnnotatedImage = (input: AnnotatedImageInput): HTMLCanvasElement | null => {
  const contextSource = input.frame.getContext("2d");
  if (!contextSource) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, input.pixelWidth);
  canvas.height = Math.max(1, input.pixelHeight);
  const context = canvas.getContext("2d");
  if (!context) return null;
  const frameScaleX =
    input.frameCssRect.width > 0 ? input.frame.width / input.frameCssRect.width : 1;
  const frameScaleY =
    input.frameCssRect.height > 0 ? input.frame.height / input.frameCssRect.height : 1;
  const sourceX = (input.cssRect.x - input.frameCssRect.x) * frameScaleX;
  const sourceY = (input.cssRect.y - input.frameCssRect.y) * frameScaleY;
  const sourceWidth = input.cssRect.width * frameScaleX;
  const sourceHeight = input.cssRect.height * frameScaleY;
  context.drawImage(
    input.frame,
    sourceX,
    sourceY,
    Math.max(1, sourceWidth),
    Math.max(1, sourceHeight),
    0,
    0,
    canvas.width,
    canvas.height,
  );
  input.regionRects.forEach((regionRect, index) => {
    const imageRect = mapCssRectIntoImage(regionRect, input.cssRect, input.scale);
    const numberLabel = String(input.numbers[index] ?? index + 1);
    drawOutline(context, imageRect, numberLabel, input.scale);
  });
  return canvas;
};
