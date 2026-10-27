import type { RegionDirection } from "./describe-region-layout.js";
import type { RegionLayout, RegionNeighbor } from "./describe-region-layout.js";
import type { CoordinateFrame, RegionMeasurement } from "../types.js";
import { formatCoordinateFrameText } from "./coordinate-frame.js";

export interface RegionContextTextInput {
  measurement: RegionMeasurement;
  layout: RegionLayout;
  note: string;
  coordinateFrame?: CoordinateFrame | null;
}

const DIRECTION_PHRASE: Record<RegionDirection, string> = {
  above: "below",
  below: "above",
  left: "right of",
  right: "left of",
};

const PHRASE_ORDER: readonly RegionDirection[] = ["above", "below", "right", "left"];

export const formatRegionSizeLabel = (width: number, height: number): string =>
  `${Math.round(width)}×${Math.round(height)}`;

const bracketLabel = (label: string): string => `<${label}>`;

const roundRect = (rect: { x: number; y: number; width: number; height: number }): string =>
  `x=${Math.round(rect.x)} y=${Math.round(rect.y)} ${formatRegionSizeLabel(rect.width, rect.height)}`;

const percentSuffix = (rect: { x: number; y: number; width: number; height: number }): string =>
  `x=${rect.x}% y=${rect.y}% w=${rect.width}% h=${rect.height}%`;

const neighborPhrase = (neighbors: readonly RegionNeighbor[]): string => {
  const phrases: string[] = [];
  for (const direction of PHRASE_ORDER) {
    const neighbor = neighbors.find((candidate) => candidate.direction === direction);
    if (!neighbor) continue;
    phrases.push(`${DIRECTION_PHRASE[direction]} ${bracketLabel(neighbor.candidate.label)}`);
  }
  return phrases.join(" and ");
};

const placeDescription = (layout: RegionLayout): string => {
  const relations = neighborPhrase(layout.neighbors);
  const inside = layout.ancestor ? ` inside ${bracketLabel(layout.ancestor.label)}` : "";
  if (layout.isEmpty) {
    return relations ? `empty space ${relations}${inside}` : `empty space${inside}`;
  }
  const overlapLabels = layout.intersecting.map((candidate) => bracketLabel(candidate.label));
  const overlapText =
    overlapLabels.length > 0 ? `overlaps ${overlapLabels.join(", ")}` : "overlaps elements";
  return relations ? `${overlapText} ${relations}${inside}` : `${overlapText}${inside}`;
};

const neighborLines = (neighbors: readonly RegionNeighbor[]): string[] => {
  const lines = ["neighbors:"];
  for (const direction of ["above", "below", "left", "right"] as const) {
    const neighbor = neighbors.find((candidate) => candidate.direction === direction);
    lines.push(
      neighbor
        ? `  ${direction}: ${bracketLabel(neighbor.candidate.label)} ${neighbor.distancePx}px`
        : `  ${direction}: none`,
    );
  }
  return lines;
};

export const formatRegionContext = (input: RegionContextTextInput): string => {
  const { measurement, layout } = input;
  const note = input.note.replace(/\s+/g, " ").trim();
  const { viewport, viewportPercent } = measurement;
  const headline =
    `Region at x=${viewportPercent.x}%, y=${viewportPercent.y}% ` +
    `(${formatRegionSizeLabel(viewport.width, viewport.height)}) — ${placeDescription(layout)}` +
    (note ? `; Request: ${note}` : "");

  const lines = [
    headline,
    `anchor: ${measurement.anchor}`,
    `viewport: ${roundRect(measurement.viewport)} (${percentSuffix(measurement.viewportPercent)} of viewport)`,
    `page: ${roundRect(measurement.page)} (${percentSuffix(measurement.documentPercent)} of document)`,
  ];

  if (layout.ancestor) {
    lines.push(`inside: ${bracketLabel(layout.ancestor.label)}`);
    if (layout.ancestor.detail) lines.push(`  ${layout.ancestor.detail}`);
    if (layout.ancestor.selector) lines.push(`  selector: ${layout.ancestor.selector}`);
  } else {
    lines.push("inside: none");
  }

  if (layout.intersecting.length === 0) {
    lines.push("intersects: none");
  } else {
    lines.push("intersects:");
    for (const candidate of layout.intersecting) {
      const selector = candidate.selector ? ` selector: ${candidate.selector}` : "";
      lines.push(`  - ${bracketLabel(candidate.label)}${selector}`);
    }
  }

  lines.push(...neighborLines(layout.neighbors));
  lines.push(`empty: ${layout.isEmpty ? "yes" : "no"}`);
  if (input.coordinateFrame) lines.push(formatCoordinateFrameText(input.coordinateFrame));
  return lines.join("\n");
};
