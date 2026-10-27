import { describe, expect, it } from "vite-plus/test";
import { describeRegionLayout } from "../src/utils/describe-region-layout.js";
import type { RegionLayoutCandidate } from "../src/utils/describe-region-layout.js";
import { formatRegionContext } from "../src/utils/format-region-context.js";
import { measureRegionRect } from "../src/utils/measure-region-rect.js";

const region = { x: 744, y: 320, width: 320, height: 180 };

const candidate = (
  key: string,
  label: string,
  bounds: { x: number; y: number; width: number; height: number },
): RegionLayoutCandidate => ({
  key,
  label,
  bounds,
  selector: null,
  detail: null,
});

describe("measureRegionRect", () => {
  it("reports viewport and page rectangles with rounded percents", () => {
    const measurement = measureRegionRect({
      anchor: "page",
      viewport: region,
      scrollX: 0,
      scrollY: 1780,
      viewportWidth: 1200,
      viewportHeight: 800,
      documentWidth: 1200,
      documentHeight: 4000,
    });

    expect(measurement.viewport).toEqual(region);
    expect(measurement.page).toEqual({ x: 744, y: 2100, width: 320, height: 180 });
    expect(measurement.viewportPercent.x).toBe(62);
    expect(measurement.viewportPercent.y).toBe(40);
    expect(measurement.documentPercent.y).toBe(53);
  });
});

describe("describeRegionLayout", () => {
  const dashboard = candidate("dashboard", "Dashboard", {
    x: 700,
    y: 280,
    width: 500,
    height: 400,
  });
  const projectCard = candidate("project-card", "ProjectCard", {
    x: 744,
    y: 200,
    width: 320,
    height: 100,
  });
  const taskStats = candidate("task-stats", "TaskStats", {
    x: 1100,
    y: 320,
    width: 80,
    height: 180,
  });

  it("treats the tightest container as the ancestor and keeps it out of the overlap list", () => {
    const layout = describeRegionLayout(region, [dashboard, projectCard, taskStats]);

    expect(layout.ancestor?.label).toBe("Dashboard");
    expect(layout.intersecting.map((item) => item.label)).not.toContain("Dashboard");
    expect(layout.isEmpty).toBe(true);
    expect(layout.neighbors.map((neighbor) => neighbor.direction).sort()).toEqual([
      "above",
      "right",
    ]);
  });

  it("marks a region non-empty when an element overlaps it", () => {
    const overlappingCard = candidate("card", "ProjectCard", {
      x: 760,
      y: 340,
      width: 120,
      height: 80,
    });
    const layout = describeRegionLayout(region, [dashboard, overlappingCard]);

    expect(layout.isEmpty).toBe(false);
    expect(layout.intersecting.map((item) => item.label)).toEqual(["ProjectCard"]);
    expect(layout.intersecting[0]?.regionCoverage).toBeCloseTo(9600 / 57600);
    expect(layout.intersecting[0]?.elementCoverage).toBe(1);
    expect(layout.ancestor?.label).toBe("Dashboard");
  });

  it("sorts overlaps by how much of the region they cover", () => {
    const largeOverlap = candidate("large", "LargeCard", {
      x: 744,
      y: 320,
      width: 300,
      height: 160,
    });
    const smallOverlap = candidate("small", "SmallCard", {
      x: 760,
      y: 340,
      width: 120,
      height: 80,
    });
    const layout = describeRegionLayout(region, [dashboard, smallOverlap, largeOverlap]);

    expect(layout.intersecting.map((item) => item.label)).toEqual(["LargeCard", "SmallCard"]);
    expect(layout.intersecting[0]?.regionCoverage).toBeGreaterThan(
      layout.intersecting[1]?.regionCoverage ?? 0,
    );
  });
});

describe("formatRegionContext", () => {
  it("writes the headline a model can place on the page", () => {
    const measurement = measureRegionRect({
      anchor: "page",
      viewport: region,
      scrollX: 0,
      scrollY: 1780,
      viewportWidth: 1200,
      viewportHeight: 800,
      documentWidth: 1200,
      documentHeight: 4000,
    });
    const layout = describeRegionLayout(region, [
      candidate("dashboard", "Dashboard", { x: 700, y: 280, width: 500, height: 400 }),
      candidate("project-card", "ProjectCard", { x: 744, y: 200, width: 320, height: 100 }),
      candidate("task-stats", "TaskStats", { x: 1100, y: 320, width: 80, height: 180 }),
    ]);

    const text = formatRegionContext({
      measurement,
      layout,
      note: "add a chart",
    });

    expect(
      text.startsWith(
        "Region at x=62%, y=40% (320×180) — empty space below <ProjectCard> and left of <TaskStats> inside <Dashboard>; Request: add a chart",
      ),
    ).toBe(true);
    expect(text).toContain("anchor: page");
    expect(text).toContain("page: x=744 y=2100 320×180");
    expect(text).toContain("empty: yes");
  });
});
