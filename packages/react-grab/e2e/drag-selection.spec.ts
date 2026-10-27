import { test, expect } from "./fixtures.js";
import type { ReactGrabPageObject } from "./fixtures.js";

const TODO_LIST_ITEM_SELECTOR = "[data-testid='todo-list'] li";

declare global {
  interface Window {
    __DID_WIDE_TEXT_DRAG_END__?: boolean;
    __WIDE_TEXT_DRAG_TARGET_IDS__?: string[];
  }
}

const configureWideTextTarget = async (
  reactGrab: ReactGrabPageObject,
  shouldAddEmptySpaceSentinel = false,
): Promise<void> => {
  await reactGrab.page.evaluate((shouldAddSentinel) => {
    for (const pageElement of document.body.querySelectorAll("*")) {
      if (pageElement instanceof HTMLElement && !pageElement.closest("[data-react-grab]")) {
        pageElement.style.visibility = "hidden";
      }
    }
    const cardElement = document.createElement("div");
    cardElement.id = "wide-text-drag-card";
    cardElement.style.cssText =
      "position:fixed;left:20px;top:80px;width:500px;height:80px;background:#222;visibility:visible;z-index:10000";
    const paragraphElement = document.createElement("p");
    paragraphElement.id = "wide-text-drag-target";
    paragraphElement.textContent = "Short label";
    Object.assign(paragraphElement.style, {
      font: "20px sans-serif",
      height: "40px",
      left: "20px",
      lineHeight: "40px",
      margin: "0",
      position: "fixed",
      top: "80px",
      visibility: "visible",
      width: "500px",
    });
    cardElement.append(paragraphElement);
    document.body.append(cardElement);
    if (shouldAddSentinel) {
      const sentinelElement = document.createElement("button");
      sentinelElement.id = "wide-text-drag-sentinel";
      sentinelElement.textContent = "Sentinel";
      sentinelElement.style.cssText =
        "position:fixed;left:370px;top:90px;width:40px;height:20px;z-index:10001";
      document.body.append(sentinelElement);
    }

    window.__DID_WIDE_TEXT_DRAG_END__ = false;
    window.__WIDE_TEXT_DRAG_TARGET_IDS__ = [];
    const api = window.__REACT_GRAB__;
    api?.unregisterPlugin("wide-text-drag-tracking");
    api?.registerPlugin({
      name: "wide-text-drag-tracking",
      hooks: {
        onDragEnd: (selectedElements: Element[]) => {
          window.__DID_WIDE_TEXT_DRAG_END__ = true;
          window.__WIDE_TEXT_DRAG_TARGET_IDS__ = selectedElements.map(
            (selectedElement) => selectedElement.id,
          );
        },
      },
    });
  }, shouldAddEmptySpaceSentinel);
};

const getWideTextDragTargetIds = async (reactGrab: ReactGrabPageObject): Promise<string[]> =>
  reactGrab.page.evaluate(() => window.__WIDE_TEXT_DRAG_TARGET_IDS__ ?? []);

const didWideTextDragEnd = async (reactGrab: ReactGrabPageObject): Promise<boolean> =>
  reactGrab.page.evaluate(() => window.__DID_WIDE_TEXT_DRAG_END__ ?? false);

test.describe("Drag Selection", () => {
  test("should keep drag active when releasing Space in hold mode with Space activation key", async ({
    reactGrab,
  }) => {
    await reactGrab.activate();
    await reactGrab.updateOptions({
      activationKey: "Space",
      activationMode: "hold",
      keyHoldDuration: 0,
    });

    const firstItem = reactGrab.page.locator(TODO_LIST_ITEM_SELECTOR).first();
    const firstBox = await firstItem.boundingBox();
    if (!firstBox) throw new Error("Could not get bounding box");

    const startX = firstBox.x - 20;
    const startY = firstBox.y - 20;

    await reactGrab.page.mouse.move(startX, startY);
    await reactGrab.page.mouse.down();
    await reactGrab.page.mouse.move(startX + 220, startY + 150, { steps: 8 });
    await reactGrab.page.waitForTimeout(100);

    const boundsBeforeSpaceRelease = await reactGrab.getDragBoxBounds();
    expect(boundsBeforeSpaceRelease).not.toBeNull();
    if (!boundsBeforeSpaceRelease) throw new Error("Expected drag bounds before space release");

    await reactGrab.page.keyboard.down("Space");
    await reactGrab.page.keyboard.up("Space");
    await reactGrab.page.mouse.move(startX + 280, startY + 190, { steps: 4 });
    await reactGrab.page.waitForTimeout(100);
    expect(await reactGrab.isOverlayVisible()).toBe(true);

    const boundsAfterSpaceRelease = await reactGrab.getDragBoxBounds();
    expect(boundsAfterSpaceRelease).not.toBeNull();
    if (!boundsAfterSpaceRelease) throw new Error("Expected drag bounds after space release");

    await reactGrab.page.mouse.up();
  });

  test("holding Space lets a page click through", async ({ reactGrab }) => {
    await reactGrab.page.evaluate(() => {
      const button = document.createElement("button");
      button.id = "space-passthrough-button";
      button.type = "button";
      button.textContent = "Page button";
      button.style.cssText =
        "position:fixed;left:240px;top:80px;width:140px;height:40px;z-index:20;";
      button.addEventListener("click", () => {
        button.dataset.clicks = String(Number(button.dataset.clicks ?? "0") + 1);
      });
      document.body.append(button);
    });
    await reactGrab.activate();

    await reactGrab.page.keyboard.down("Space");
    await reactGrab.page.locator("#space-passthrough-button").click();
    await reactGrab.page.keyboard.up("Space");

    await expect
      .poll(() => reactGrab.page.locator("#space-passthrough-button").getAttribute("data-clicks"))
      .toBe("1");

    await reactGrab.page.locator("#space-passthrough-button").click();
    await reactGrab.page.waitForTimeout(200);
    expect(
      await reactGrab.page.locator("#space-passthrough-button").getAttribute("data-clicks"),
    ).toBe("1");
  });

  test("should create drag box when clicking and dragging", async ({ reactGrab }) => {
    await reactGrab.activate();

    const firstItem = reactGrab.page.locator(TODO_LIST_ITEM_SELECTOR).first();
    const firstBox = await firstItem.boundingBox();
    if (!firstBox) throw new Error("Could not get bounding box");

    const startX = firstBox.x - 20;
    const startY = firstBox.y - 20;

    await reactGrab.page.mouse.move(startX, startY);
    await reactGrab.page.mouse.down();
    await reactGrab.page.waitForTimeout(50);

    await reactGrab.page.mouse.move(startX + 100, startY + 100, { steps: 5 });
    await reactGrab.page.waitForTimeout(100);

    const isVisible = await reactGrab.isOverlayVisible();
    expect(isVisible).toBe(true);

    await reactGrab.page.mouse.up();
  });

  test("should open a region when a drag covers elements", async ({ reactGrab }) => {
    await reactGrab.activate();

    await reactGrab.dragSelect(
      `${TODO_LIST_ITEM_SELECTOR}:first-child`,
      `${TODO_LIST_ITEM_SELECTOR}:nth-child(3)`,
    );

    await expect
      .poll(() => reactGrab.page.locator("textarea[data-react-grab-input]").count())
      .toBeGreaterThan(0);
  });

  test("should ignore empty space inside a wide text layout box", async ({ reactGrab }) => {
    await configureWideTextTarget(reactGrab, true);
    await reactGrab.activate();

    const paragraphBounds = await reactGrab.page.locator("#wide-text-drag-target").boundingBox();
    if (!paragraphBounds) throw new Error("Could not get wide text bounds");

    await reactGrab.page.mouse.move(paragraphBounds.x + 300, paragraphBounds.y + 5);
    await reactGrab.page.mouse.down();
    await reactGrab.page.mouse.move(paragraphBounds.x + 450, paragraphBounds.y + 35, {
      steps: 5,
    });
    await reactGrab.page.mouse.up();

    expect(await didWideTextDragEnd(reactGrab)).toBe(true);
    const selectedTargetIds = await getWideTextDragTargetIds(reactGrab);
    expect(selectedTargetIds).toContain("wide-text-drag-sentinel");
    await expect.poll(() => reactGrab.isPromptModeActive()).toBe(true);
  });

  test("should drag-select the painted part of a wide text element", async ({ reactGrab }) => {
    await configureWideTextTarget(reactGrab);
    await reactGrab.activate();

    const textBounds = await reactGrab.page
      .locator("#wide-text-drag-target")
      .evaluate((element) => {
        const textNode = element.firstChild;
        if (!textNode) return null;
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const bounds = range.getBoundingClientRect();
        return { bottom: bounds.bottom, left: bounds.left, right: bounds.right, top: bounds.top };
      });
    if (!textBounds) throw new Error("Could not get painted text bounds");

    await reactGrab.page.mouse.move(textBounds.left - 10, textBounds.top - 5);
    await reactGrab.page.mouse.down();
    await reactGrab.page.mouse.move(textBounds.right + 10, textBounds.bottom + 5, { steps: 5 });
    await reactGrab.page.mouse.up();

    expect(await getWideTextDragTargetIds(reactGrab)).toContain("wide-text-drag-target");
  });

  test("should hover the card through empty width beside its text", async ({ reactGrab }) => {
    await configureWideTextTarget(reactGrab);
    await reactGrab.activate();

    const paragraphBounds = await reactGrab.page.locator("#wide-text-drag-target").boundingBox();
    if (!paragraphBounds) throw new Error("Could not get wide text bounds");

    await reactGrab.page.mouse.move(paragraphBounds.x + 20, paragraphBounds.y + 20);
    await expect.poll(async () => (await reactGrab.getSelectionLabelInfo()).tagName).toBe("p");

    await reactGrab.page.mouse.move(paragraphBounds.x + 300, paragraphBounds.y + 20);
    await expect.poll(async () => (await reactGrab.getSelectionLabelInfo()).tagName).toBe("div");
  });

  test("should keep the full box targetable when a wide text element has paint", async ({
    reactGrab,
  }) => {
    await configureWideTextTarget(reactGrab);
    await reactGrab.page.locator("#wide-text-drag-target").evaluate((paragraphElement) => {
      paragraphElement.style.background = "rgb(34, 34, 34)";
    });
    await reactGrab.activate();

    const paragraphBounds = await reactGrab.page.locator("#wide-text-drag-target").boundingBox();
    if (!paragraphBounds) throw new Error("Could not get wide text bounds");

    await reactGrab.page.mouse.move(paragraphBounds.x + 300, paragraphBounds.y + 20);
    await expect.poll(async () => (await reactGrab.getSelectionLabelInfo()).tagName).toBe("p");
  });

  test("should copy all selected elements to clipboard", async ({ reactGrab }) => {
    await reactGrab.activate();

    await reactGrab.dragSelect(
      `${TODO_LIST_ITEM_SELECTOR}:first-child`,
      `${TODO_LIST_ITEM_SELECTOR}:nth-child(5)`,
    );
    await reactGrab.page.keyboard.press("Enter");

    await expect.poll(() => reactGrab.getClipboardContent()).toContain("Region at");
  });

  test("should cancel drag selection on Escape", async ({ reactGrab }) => {
    await reactGrab.activate();

    const firstItem = reactGrab.page.locator(TODO_LIST_ITEM_SELECTOR).first();
    const firstBox = await firstItem.boundingBox();
    if (!firstBox) throw new Error("Could not get bounding box");

    await reactGrab.page.mouse.move(firstBox.x - 10, firstBox.y - 10);
    await reactGrab.page.mouse.down();
    await reactGrab.page.mouse.move(firstBox.x + 200, firstBox.y + 200, {
      steps: 5,
    });

    await reactGrab.pressEscape();
    await reactGrab.page.mouse.up();

    await reactGrab.page.waitForTimeout(100);

    const isVisible = await reactGrab.isOverlayVisible();
    expect(isVisible).toBe(false);
  });

  test("should not trigger drag for small movements", async ({ reactGrab }) => {
    await reactGrab.activate();

    const listItem = reactGrab.page.locator(TODO_LIST_ITEM_SELECTOR).first();
    const box = await listItem.boundingBox();
    if (!box) throw new Error("Could not get bounding box");

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await reactGrab.page.mouse.move(centerX, centerY);
    await reactGrab.page.mouse.down();
    await reactGrab.page.mouse.move(centerX + 1, centerY + 1);
    await reactGrab.page.mouse.up();

    await reactGrab.page.waitForTimeout(500);

    const clipboardContent = await reactGrab.getClipboardContent();
    expect(clipboardContent).toBeTruthy();
  });

  test("should keep the region prompt open after a drag in toggle mode", async ({ reactGrab }) => {
    await reactGrab.activate();

    await reactGrab.dragSelect(
      `${TODO_LIST_ITEM_SELECTOR}:first-child`,
      `${TODO_LIST_ITEM_SELECTOR}:nth-child(2)`,
    );

    await reactGrab.page.waitForTimeout(300);

    const isVisible = await reactGrab.isOverlayVisible();
    expect(isVisible).toBe(true);
    await expect
      .poll(() => reactGrab.page.locator("textarea[data-react-grab-input]").count())
      .toBeGreaterThan(0);
  });

  test("should handle drag across entire list", async ({ reactGrab }) => {
    await reactGrab.activate();

    await reactGrab.dragSelect(
      "[data-testid='todo-list'] li:first-child",
      "[data-testid='todo-list'] li:last-child",
    );
    await reactGrab.page.keyboard.press("Enter");

    await expect.poll(() => reactGrab.getClipboardContent()).toContain("Region at");
  });

  test("should show visual feedback during drag", async ({ reactGrab }) => {
    await reactGrab.activate();

    const firstItem = reactGrab.page.locator(TODO_LIST_ITEM_SELECTOR).first();
    const lastItem = reactGrab.page.locator(TODO_LIST_ITEM_SELECTOR).last();

    const startBox = await firstItem.boundingBox();
    const endBox = await lastItem.boundingBox();
    if (!startBox || !endBox) throw new Error("Could not get bounding boxes");

    await reactGrab.page.mouse.move(startBox.x - 10, startBox.y - 10);
    await reactGrab.page.mouse.down();

    await reactGrab.page.mouse.move(endBox.x + endBox.width + 10, endBox.y + endBox.height + 10, {
      steps: 10,
    });

    const hasContent = await reactGrab.page.evaluate(() => {
      const host = document.querySelector("[data-react-grab]");
      const shadowRoot = host?.shadowRoot;
      if (!shadowRoot) return false;
      const root = shadowRoot.querySelector("[data-react-grab]");
      return root !== null && root.innerHTML.length > 0;
    });

    expect(hasContent).toBe(true);

    await reactGrab.page.mouse.up();
  });
});

test.describe("Drag Selection with Scroll", () => {
  test("should handle drag selection with scroll offset", async ({ reactGrab }) => {
    await reactGrab.scrollPage(100);
    await reactGrab.page.waitForTimeout(100);

    await reactGrab.activate();
    await reactGrab.dragSelect(
      `${TODO_LIST_ITEM_SELECTOR}:first-child`,
      `${TODO_LIST_ITEM_SELECTOR}:nth-child(2)`,
    );
    await reactGrab.page.keyboard.press("Enter");

    await expect.poll(() => reactGrab.getClipboardContent()).toContain("Region at");
  });

  test("should maintain drag while scrolling", async ({ reactGrab }) => {
    await reactGrab.activate();

    const firstItem = reactGrab.page.locator(TODO_LIST_ITEM_SELECTOR).first();
    const firstBox = await firstItem.boundingBox();
    if (!firstBox) throw new Error("Could not get bounding box");

    await reactGrab.page.mouse.move(firstBox.x - 10, firstBox.y - 10);
    await reactGrab.page.mouse.down();
    await reactGrab.page.mouse.move(firstBox.x + 100, firstBox.y + 100, {
      steps: 5,
    });

    await reactGrab.scrollPage(50);
    await reactGrab.page.waitForTimeout(100);

    await reactGrab.page.mouse.up();

    const state = await reactGrab.getState();
    expect(state).toBeDefined();
  });

  test("should select elements after scrolling down", async ({ reactGrab }) => {
    await reactGrab.activate();
    await reactGrab.scrollPage(300);
    await reactGrab.page.waitForTimeout(200);

    const listItems = reactGrab.page.locator(TODO_LIST_ITEM_SELECTOR);
    const count = await listItems.count();

    if (count > 0) {
      await reactGrab.dragSelect(
        `${TODO_LIST_ITEM_SELECTOR}:first-child`,
        `${TODO_LIST_ITEM_SELECTOR}:nth-child(2)`,
      );
      await reactGrab.page.keyboard.press("Enter");

      await expect.poll(() => reactGrab.getClipboardContent()).toContain("Region at");
    }
  });

  test("drag bounds should exist during drag operation", async ({ reactGrab }) => {
    await reactGrab.activate();

    const firstItem = reactGrab.page.locator(TODO_LIST_ITEM_SELECTOR).first();
    const firstBox = await firstItem.boundingBox();
    if (!firstBox) throw new Error("Could not get bounding box");

    await reactGrab.page.mouse.move(firstBox.x - 10, firstBox.y - 10);
    await reactGrab.page.mouse.down();
    await reactGrab.page.mouse.move(firstBox.x + 200, firstBox.y + 200, {
      steps: 5,
    });
    await reactGrab.page.waitForTimeout(100);

    const bounds = await reactGrab.getDragBoxBounds();
    expect(bounds).not.toBeNull();

    await reactGrab.page.mouse.up();
  });

  test("drag selection should work in scrollable container", async ({ reactGrab }) => {
    await reactGrab.activate();

    const scrollContainer = reactGrab.page.locator("[data-testid='scroll-container']");
    const box = await scrollContainer.boundingBox();

    if (box) {
      await reactGrab.page.mouse.move(box.x + 10, box.y + 10);
      await reactGrab.page.mouse.down();
      await reactGrab.page.mouse.move(box.x + 200, box.y + 100, { steps: 5 });
      await reactGrab.page.mouse.up();
      await reactGrab.page.keyboard.press("Enter");

      await expect.poll(() => reactGrab.getClipboardContent()).toContain("Region at");
    }
  });
});
