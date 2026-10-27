import { expect, test } from "./fixtures.js";
import type { ReactGrabPageObject } from "./fixtures.js";

const CLIPBOARD_COMMIT_TIMEOUT_MS = 15_000;

interface RegionSnapshot {
  anchor: "page" | "viewport";
  bounds: { x: number; y: number; width: number; height: number };
}

const injectPageChrome = async (reactGrab: ReactGrabPageObject) => {
  await reactGrab.page.evaluate(() => {
    document.body.style.minHeight = "2400px";

    const sidebar = document.createElement("aside");
    sidebar.id = "region-fixed-sidebar";
    sidebar.style.cssText =
      "position:fixed;left:0;top:0;width:180px;height:100vh;background:#111;z-index:50;color:#fff;";

    const link = document.createElement("a");
    link.id = "region-fixed-link";
    link.href = "#region-link-should-not-navigate";
    link.textContent = "Sidebar link";
    link.style.cssText = "display:block;padding:16px;color:#fff;";

    const svgButton = document.createElement("button");
    svgButton.id = "region-svg-button";
    svgButton.type = "button";
    svgButton.style.cssText =
      "position:absolute;left:16px;top:520px;width:32px;height:32px;padding:0;border:0;background:transparent;color:#fff;";
    svgButton.innerHTML =
      '<svg id="region-svg-icon" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" fill="currentColor"></rect></svg>';

    sidebar.append(link, svgButton);
    document.body.append(sidebar);

    const pad = document.createElement("div");
    pad.id = "region-main-pad";
    pad.style.cssText =
      "position:absolute;left:220px;top:1500px;width:800px;height:500px;background:#f3f3f3;";
    document.body.append(pad);
  });
};

const readRegions = async (reactGrab: ReactGrabPageObject): Promise<RegionSnapshot[]> =>
  reactGrab.page.evaluate(() => {
    const state = window.__REACT_GRAB__?.getState() as
      | {
          regions?: RegionSnapshot[];
        }
      | undefined;
    return state?.regions ?? [];
  });

const readDragSizeLabel = async (reactGrab: ReactGrabPageObject): Promise<string> =>
  reactGrab.page.evaluate(() => {
    const host = document.querySelector("[data-react-grab]");
    return host?.shadowRoot?.querySelector("[data-react-grab-drag-size]")?.textContent ?? "";
  });

const dragBox = async (
  reactGrab: ReactGrabPageObject,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) => {
  await reactGrab.page.mouse.move(startX, startY);
  await reactGrab.page.mouse.down();
  await reactGrab.page.mouse.move(endX, endY, { steps: 8 });
  await reactGrab.page.mouse.up();
};

test.describe("Region selection", () => {
  test.beforeEach(async ({ reactGrab }) => {
    await injectPageChrome(reactGrab);
  });

  test("selects a fixed sidebar link and svg without activating them", async ({ reactGrab }) => {
    await reactGrab.activate();

    const svgButton = reactGrab.page.locator("#region-svg-button");
    const svgBox = await svgButton.boundingBox();
    if (!svgBox) throw new Error("Could not get svg button bounds");
    await reactGrab.page.mouse.click(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);

    await expect
      .poll(() => reactGrab.getClipboardContent(), { timeout: CLIPBOARD_COMMIT_TIMEOUT_MS })
      .toMatch(/svg|button/i);
    await expect(reactGrab.page).not.toHaveURL(/region-link-should-not-navigate/);

    await reactGrab.activate();
    const link = reactGrab.page.locator("#region-fixed-link");
    const linkBox = await link.boundingBox();
    if (!linkBox) throw new Error("Could not get sidebar link bounds");
    await reactGrab.page.mouse.click(linkBox.x + 12, linkBox.y + 10);

    await expect
      .poll(() => reactGrab.getClipboardContent(), { timeout: CLIPBOARD_COMMIT_TIMEOUT_MS })
      .toContain("Sidebar link");
    await expect(reactGrab.page).not.toHaveURL(/region-link-should-not-navigate/);
  });

  test("draws a viewport-anchored region on fixed chrome and a page-anchored region in the document", async ({
    reactGrab,
  }) => {
    await reactGrab.activate();

    const sidebar = reactGrab.page.locator("#region-fixed-sidebar");
    const sidebarBox = await sidebar.boundingBox();
    if (!sidebarBox) throw new Error("Could not get sidebar bounds");

    await reactGrab.page.mouse.move(sidebarBox.x + 24, sidebarBox.y + 280);
    await reactGrab.page.mouse.down();
    await reactGrab.page.mouse.move(sidebarBox.x + 140, sidebarBox.y + 380, { steps: 8 });
    await expect.poll(() => readDragSizeLabel(reactGrab)).toMatch(/\d+×\d+/);
    await reactGrab.page.mouse.up();

    await expect.poll(() => reactGrab.isPromptModeActive()).toBe(true);
    const viewportRegion = (await readRegions(reactGrab))[0];
    expect(viewportRegion?.anchor).toBe("viewport");
    if (!viewportRegion) throw new Error("Expected a viewport region");
    const viewportY = viewportRegion.bounds.y;

    await reactGrab.page.evaluate(() => window.scrollBy(0, 180));
    const regionAfterScroll = (await readRegions(reactGrab))[0];
    expect(regionAfterScroll?.anchor).toBe("viewport");
    expect(regionAfterScroll?.bounds.y).toBeCloseTo(viewportY, 0);

    await reactGrab.pressEscape();
    await reactGrab.pressEscape();
    await reactGrab.activate();

    const pad = reactGrab.page.locator("#region-main-pad");
    const padBox = await pad.boundingBox();
    if (!padBox) throw new Error("Could not get main pad bounds");
    await dragBox(reactGrab, padBox.x + 40, padBox.y + 40, padBox.x + 180, padBox.y + 140);

    await expect.poll(() => reactGrab.isPromptModeActive()).toBe(true);
    const pageRegion = (await readRegions(reactGrab))[0];
    expect(pageRegion?.anchor).toBe("page");
    if (!pageRegion) throw new Error("Expected a page region");
    const pageY = pageRegion.bounds.y;

    await reactGrab.page.evaluate(() => window.scrollBy(0, 160));
    const pageRegionAfterScroll = (await readRegions(reactGrab))[0];
    expect(pageRegionAfterScroll?.bounds.y).toBeLessThan(pageY - 40);

    await reactGrab.typeInInput("add a chart");
    await reactGrab.page.keyboard.press("Enter");
    await expect
      .poll(() => reactGrab.getClipboardContent(), { timeout: CLIPBOARD_COMMIT_TIMEOUT_MS })
      .toMatch(/Region at x=\d+%, y=\d+% \(\d+×\d+\)/);
    const clipboardContent = await reactGrab.getClipboardContent();
    expect(clipboardContent).toContain("Request: add a chart");
    expect(clipboardContent).toContain("anchor: page");
    expect(clipboardContent).toContain("viewport ");
    expect(clipboardContent).toMatch(/DPR \d/);
    expect(clipboardContent).toContain("zoom ~");
  });

  test("cancels an in-progress region drag with Escape and still copies a clicked element", async ({
    reactGrab,
  }) => {
    await reactGrab.activate();

    const sidebar = reactGrab.page.locator("#region-fixed-sidebar");
    const sidebarBox = await sidebar.boundingBox();
    if (!sidebarBox) throw new Error("Could not get sidebar bounds");
    await reactGrab.page.mouse.move(sidebarBox.x + 20, sidebarBox.y + 300);
    await reactGrab.page.mouse.down();
    await reactGrab.page.mouse.move(sidebarBox.x + 120, sidebarBox.y + 390, { steps: 6 });
    await reactGrab.pressEscape();
    await reactGrab.page.mouse.up();

    expect(await reactGrab.isOverlayVisible()).toBe(false);
    expect(await readRegions(reactGrab)).toEqual([]);

    await reactGrab.page.evaluate(() => document.getElementById("region-fixed-sidebar")?.remove());
    await reactGrab.activate();
    const todoItem = reactGrab.page.locator("[data-testid='todo-list'] li").first();
    const todoBox = await todoItem.boundingBox();
    if (!todoBox) throw new Error("Could not get todo bounds");
    await reactGrab.page.mouse.click(todoBox.x + 24, todoBox.y + todoBox.height / 2);

    await expect
      .poll(() => reactGrab.getClipboardContent(), { timeout: CLIPBOARD_COMMIT_TIMEOUT_MS })
      .toContain("TodoList");
  });

  test("maps a region through a transformed ancestor", async ({ reactGrab }) => {
    await reactGrab.page.evaluate(() => {
      const canvas = document.createElement("div");
      canvas.id = "region-zoom-canvas";
      canvas.style.cssText =
        "position:absolute;left:400px;top:80px;width:240px;height:180px;background:#e8eefc;transform:scale(2);transform-origin:top left;";
      document.body.append(canvas);
    });
    await reactGrab.activate();

    const canvas = reactGrab.page.locator("#region-zoom-canvas");
    const canvasBox = await canvas.boundingBox();
    if (!canvasBox) throw new Error("Could not get zoom canvas bounds");
    await dragBox(
      reactGrab,
      canvasBox.x + 30,
      canvasBox.y + 30,
      canvasBox.x + 150,
      canvasBox.y + 110,
    );
    await expect.poll(() => reactGrab.isPromptModeActive()).toBe(true);
    await reactGrab.typeInInput("place it here");
    await reactGrab.page.keyboard.press("Enter");

    await expect
      .poll(() => reactGrab.getClipboardContent(), { timeout: CLIPBOARD_COMMIT_TIMEOUT_MS })
      .toContain("scale=2,2");
    const clipboardContent = await reactGrab.getClipboardContent();
    const screenMatch = clipboardContent.match(/screen: x=-?\d+ y=-?\d+ (\d+)×(\d+)/);
    const localMatch = clipboardContent.match(/local: x=-?\d+ y=-?\d+ (\d+)×(\d+)/);
    expect(screenMatch).toBeTruthy();
    expect(localMatch).toBeTruthy();
    if (!screenMatch || !localMatch) return;
    expect(Math.abs(Number(localMatch[1]) * 2 - Number(screenMatch[1]))).toBeLessThanOrEqual(2);
    expect(Math.abs(Number(localMatch[2]) * 2 - Number(screenMatch[2]))).toBeLessThanOrEqual(2);
  });

  test("ignores a drag smaller than 8 by 8", async ({ reactGrab }) => {
    await reactGrab.activate();
    const pad = reactGrab.page.locator("#region-main-pad");
    await pad.scrollIntoViewIfNeeded();
    const padBox = await pad.boundingBox();
    if (!padBox) throw new Error("Could not get main pad bounds");
    await dragBox(reactGrab, padBox.x + 40, padBox.y + 40, padBox.x + 46, padBox.y + 46);

    await reactGrab.page.waitForTimeout(200);
    expect(await readRegions(reactGrab)).toEqual([]);
    expect(await reactGrab.isPromptModeActive()).toBe(false);
  });

  test("lists overlapped elements and omits one removed before copy", async ({ reactGrab }) => {
    await reactGrab.page.evaluate(() => {
      const keep = document.createElement("button");
      keep.id = "overlap-keep";
      keep.type = "button";
      keep.textContent = "Keep target";
      keep.style.cssText = "position:fixed;left:240px;top:80px;width:120px;height:80px;z-index:30;";
      const drop = document.createElement("section");
      drop.id = "overlap-drop";
      drop.textContent = "Drop target";
      drop.style.cssText = "position:fixed;left:380px;top:80px;width:120px;height:80px;z-index:30;";
      document.body.append(keep, drop);
    });
    await reactGrab.activate();
    await dragBox(reactGrab, 230, 70, 510, 170);

    const removeDrop = reactGrab.page.locator("button[aria-label='Remove section']");
    await expect.poll(() => removeDrop.count()).toBeGreaterThan(0);
    await expect
      .poll(() => reactGrab.page.locator("text=/\\d+%\\/\\d+%/").count())
      .toBeGreaterThan(0);
    await removeDrop.first().click();
    await reactGrab.page.keyboard.press("Enter");

    await expect
      .poll(() => reactGrab.getClipboardContent(), { timeout: CLIPBOARD_COMMIT_TIMEOUT_MS })
      .toContain("region:");
    const clipboardContent = await reactGrab.getClipboardContent();
    expect(clipboardContent).toContain("<button>");
    expect(clipboardContent).not.toContain("<section>");
  });

  test.describe("device pixel ratio 2", () => {
    test.use({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });

    test("copies an estimated 100% zoom beside DPR 2", async ({ reactGrab }) => {
      await reactGrab.activate();
      const sidebar = reactGrab.page.locator("#region-fixed-sidebar");
      const sidebarBox = await sidebar.boundingBox();
      if (!sidebarBox) throw new Error("Could not get sidebar bounds");
      await dragBox(
        reactGrab,
        sidebarBox.x + 24,
        sidebarBox.y + 280,
        sidebarBox.x + 140,
        sidebarBox.y + 380,
      );
      await expect.poll(() => reactGrab.isPromptModeActive()).toBe(true);
      await reactGrab.typeInInput("place it here");
      await reactGrab.page.keyboard.press("Enter");
      await expect
        .poll(() => reactGrab.getClipboardContent(), { timeout: CLIPBOARD_COMMIT_TIMEOUT_MS })
        .toContain("DPR 2, zoom ~100%");
    });
  });
});
