import { expect, test } from "./fixtures.js";

const SAMPLE_WAIT_MS = 64;

test.describe("Generic hit testing", () => {
  test("hover follows the deepest painted element for every visible playground target", async ({
    reactGrab,
  }) => {
    test.setTimeout(180_000);
    await reactGrab.page.evaluate(() => {
      const fixture = document.createElement("div");
      fixture.id = "generic-hit-fixtures";
      fixture.style.cssText =
        "position:relative;z-index:20;display:flex;flex-wrap:wrap;gap:12px;padding:16px;background:#fff;";
      fixture.innerHTML = `
        <input id="generic-hit-input" value="hit input" style="width:120px;height:32px;" />
        <select id="generic-hit-select" style="width:120px;height:32px;"><option>hit select</option></select>
        <img id="generic-hit-img" alt="hit img" width="40" height="40" style="display:block;width:40px;height:40px;background:#ddd;" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" />
        <canvas id="generic-hit-canvas" width="40" height="40" style="display:block;width:40px;height:40px;background:#333;"></canvas>
        <svg id="generic-hit-svg" width="40" height="40" style="display:block;background:#2266ee;"><rect width="40" height="40" fill="#2266ee"></rect></svg>
        <button id="generic-hit-disabled" type="button" disabled style="width:140px;height:36px;">Disabled button</button>
        <div id="generic-hit-pe-none" style="pointer-events:none;background:#fc0;width:120px;height:36px;">Painted none</div>
        <div id="generic-hit-same-box" style="width:120px;height:36px;background:#ddd;"><span style="display:block;width:100%;height:100%;">Same box</span></div>
      `;
      document.body.prepend(fixture);
    });

    await reactGrab.activate();

    await reactGrab.page.evaluate(() => {
      const fixture = document.getElementById("generic-hit-fixtures");
      const dynamicButton = document.createElement("button");
      dynamicButton.id = "generic-hit-dynamic";
      dynamicButton.type = "button";
      dynamicButton.textContent = "Dynamic button";
      dynamicButton.style.cssText = "width:140px;height:36px;";
      fixture?.append(dynamicButton);
    });

    const result = await reactGrab.page.evaluate(async (waitMs) => {
      const replacedTags = new Set([
        "A",
        "AUDIO",
        "BUTTON",
        "CANVAS",
        "DETAILS",
        "EMBED",
        "IFRAME",
        "IMG",
        "INPUT",
        "METER",
        "OBJECT",
        "OPTION",
        "PROGRESS",
        "SELECT",
        "SUMMARY",
        "TEXTAREA",
        "VIDEO",
      ]);
      const inlineTags = new Set([
        "A",
        "ABBR",
        "B",
        "BDI",
        "BDO",
        "BR",
        "CITE",
        "CODE",
        "DATA",
        "DEL",
        "DFN",
        "EM",
        "I",
        "INS",
        "KBD",
        "MARK",
        "Q",
        "S",
        "SAMP",
        "SMALL",
        "SPAN",
        "STRONG",
        "SUB",
        "SUP",
        "TIME",
        "U",
        "VAR",
        "WBR",
      ]);
      const boxRoles = new Set([
        "button",
        "checkbox",
        "combobox",
        "gridcell",
        "link",
        "listbox",
        "menuitem",
        "menuitemcheckbox",
        "menuitemradio",
        "option",
        "radio",
        "scrollbar",
        "searchbox",
        "slider",
        "spinbutton",
        "switch",
        "tab",
        "textbox",
        "treeitem",
      ]);
      const clearColor = (color: string) =>
        color === "transparent" || color === "rgba(0, 0, 0, 0)" || color.endsWith("/ 0)");
      const isGrabUi = (element: Element) => {
        if (
          element.hasAttribute("data-react-grab") ||
          element.hasAttribute("data-react-grab-demo") ||
          element.hasAttribute("data-react-grab-hit-test-shield")
        ) {
          return true;
        }
        const rootNode = element.getRootNode();
        return (
          rootNode instanceof ShadowRoot &&
          (rootNode.host.hasAttribute("data-react-grab") ||
            rootNode.host.hasAttribute("data-react-grab-demo"))
        );
      };
      const visible = (element: Element) =>
        !element.checkVisibility ||
        element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
      const containsPoint = (rect: DOMRect, x: number, y: number) =>
        x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      const textContains = (textNode: Text, x: number, y: number) => {
        const range = document.createRange();
        range.selectNodeContents(textNode);
        for (const rect of range.getClientRects()) {
          if (
            x >= rect.left - 1 &&
            x <= rect.right + 1 &&
            y >= rect.top - 1 &&
            y <= rect.bottom + 1
          ) {
            return true;
          }
        }
        return false;
      };
      const paints = (element: Element, x: number, y: number) => {
        const rect = element.getBoundingClientRect();
        if (!containsPoint(rect, x, y) || rect.width <= 0 || rect.height <= 0) return false;
        if (replacedTags.has(element.tagName)) return true;
        if (element instanceof SVGGeometryElement) {
          try {
            const matrix = element.getScreenCTM();
            if (!matrix) return false;
            const point = new DOMPoint(x, y).matrixTransform(matrix.inverse());
            const style = getComputedStyle(element);
            const fillPaints =
              style.fill !== "none" && !clearColor(style.fill) && element.isPointInFill(point);
            return fillPaints || (style.stroke !== "none" && element.isPointInStroke(point));
          } catch {
            return false;
          }
        }
        if (element.namespaceURI === "http://www.w3.org/2000/svg") {
          return element instanceof SVGTextContentElement && Boolean(element.textContent?.trim());
        }
        if (
          boxRoles.has(element.getAttribute("role") ?? "") ||
          (element instanceof HTMLElement && element.isContentEditable)
        ) {
          return true;
        }
        const style = getComputedStyle(element);
        const borderPaints =
          (style.borderTopStyle !== "none" && style.borderTopWidth !== "0px") ||
          (style.borderRightStyle !== "none" && style.borderRightWidth !== "0px") ||
          (style.borderBottomStyle !== "none" && style.borderBottomWidth !== "0px") ||
          (style.borderLeftStyle !== "none" && style.borderLeftWidth !== "0px");
        if (
          style.backgroundClip !== "text" &&
          (style.backgroundImage !== "none" || !clearColor(style.backgroundColor))
        ) {
          return true;
        }
        if (borderPaints || style.boxShadow !== "none" || style.outlineStyle !== "none")
          return true;
        const textNodes: Text[] = [];
        const collectText = (node: Node): boolean => {
          for (const child of node.childNodes) {
            if (child instanceof Text) {
              if (child.textContent?.trim()) textNodes.push(child);
              continue;
            }
            if (child instanceof Element && inlineTags.has(child.tagName)) {
              if (collectText(child)) return true;
              continue;
            }
            if (child instanceof Element) return true;
          }
          return false;
        };
        if (collectText(element) || textNodes.length === 0) return true;
        return textNodes.some((textNode) => textContains(textNode, x, y));
      };
      const stackAt = (
        root: Document | ShadowRoot,
        x: number,
        y: number,
        seenRoots: Set<Document | ShadowRoot>,
      ): Element[] => {
        if (seenRoots.has(root)) return [];
        seenRoots.add(root);
        const stack: Element[] = [];
        for (const element of root.elementsFromPoint(x, y)) {
          if (isGrabUi(element) || element.closest("[data-react-grab-ignore]")) continue;
          if (element.shadowRoot && element.shadowRoot !== root) {
            stack.push(...stackAt(element.shadowRoot, x, y, seenRoots));
          }
          if (element instanceof HTMLIFrameElement && element.contentDocument) {
            const iframeRect = element.getBoundingClientRect();
            stack.push(
              ...stackAt(
                element.contentDocument,
                x - iframeRect.left,
                y - iframeRect.top,
                seenRoots,
              ),
            );
          }
          stack.push(element);
        }
        return stack;
      };
      const expectedAt = (x: number, y: number): Element | null => {
        const stack = stackAt(document, x, y, new Set());
        let top: Element | null = null;
        let topIndex = -1;
        for (let index = 0; index < stack.length; index += 1) {
          const element = stack[index];
          if (!element || element === document.body || element === document.documentElement) break;
          if (!visible(element)) continue;
          top = element;
          topIndex = index;
          break;
        }
        if (top && !paints(top, x, y)) {
          for (let index = topIndex + 1; index < stack.length; index += 1) {
            const element = stack[index];
            if (!element || element === document.body || element === document.documentElement)
              break;
            if (!visible(element)) continue;
            if (paints(element, x, y)) {
              top = element;
              break;
            }
          }
        }
        let paintedNone: Element | null = null;
        for (const element of pointerEventsNoneElements) {
          if (getComputedStyle(element).pointerEvents !== "none") continue;
          if (isGrabUi(element) || !visible(element) || !paints(element, x, y)) continue;
          let ancestor = element.parentElement;
          while (ancestor && getComputedStyle(ancestor).pointerEvents === "none") {
            ancestor = ancestor.parentElement;
          }
          if (!ancestor || !stack.includes(ancestor)) continue;
          if (top && top !== ancestor && !ancestor.contains(top)) continue;
          if (
            top &&
            top !== ancestor &&
            getComputedStyle(element).position === "static" &&
            element.namespaceURI !== "http://www.w3.org/2000/svg"
          ) {
            continue;
          }
          if (top && top !== ancestor && !top.contains(element) && paints(top, x, y)) continue;
          if (!paintedNone || paintedNone.contains(element)) paintedNone = element;
        }
        const hit = paintedNone ?? top;
        if (!hit) return null;
        let caretNode: Node | null = null;
        const hitRoot = hit.getRootNode();
        if (document.caretPositionFromPoint) {
          const caretPosition =
            hitRoot instanceof ShadowRoot
              ? document.caretPositionFromPoint(x, y, { shadowRoots: [hitRoot] })
              : document.caretPositionFromPoint(x, y);
          caretNode = caretPosition?.offsetNode ?? null;
        } else if (document.caretRangeFromPoint) {
          caretNode = document.caretRangeFromPoint(x, y)?.startContainer ?? null;
        }
        let resolved = hit;
        const parentOfText = (textNode: Text) => {
          if (!textNode.textContent?.trim() || !textContains(textNode, x, y)) return null;
          const parentElement = textNode.parentElement;
          if (
            !parentElement ||
            parentElement === document.body ||
            parentElement === document.documentElement
          ) {
            return null;
          }
          if (parentElement !== hit && !hit.contains(parentElement)) return null;
          return parentElement;
        };
        if (caretNode instanceof Text) {
          const caretElement = parentOfText(caretNode);
          if (caretElement) resolved = caretElement;
        }
        if (resolved === hit) {
          const walker = document.createTreeWalker(hit, NodeFilter.SHOW_TEXT);
          let scannedCount = 0;
          let currentNode = walker.nextNode();
          while (currentNode && scannedCount < 400) {
            scannedCount += 1;
            if (currentNode instanceof Text) {
              const textElement = parentOfText(currentNode);
              if (textElement) {
                resolved = textElement;
                break;
              }
            }
            currentNode = walker.nextNode();
          }
        }
        for (let depth = 0; depth < 12; depth += 1) {
          let deeper: Element | null = null;
          for (const child of resolved.children) {
            const childRect = child.getBoundingClientRect();
            const currentRect = resolved.getBoundingClientRect();
            if (!containsPoint(childRect, x, y)) continue;
            if (
              Math.abs(childRect.left - currentRect.left) >= 1 ||
              Math.abs(childRect.top - currentRect.top) >= 1 ||
              Math.abs(childRect.width - currentRect.width) >= 1 ||
              Math.abs(childRect.height - currentRect.height) >= 1
            ) {
              continue;
            }
            deeper = child;
          }
          if (!deeper) break;
          resolved = deeper;
        }
        return resolved;
      };
      const describe = (element: Element | null) => {
        if (!element) return "none";
        const id = element.id ? `#${element.id}` : "";
        const testId = element.getAttribute("data-testid");
        return `${element.tagName.toLowerCase()}${id}${testId ? `[${testId}]` : ""}`;
      };
      const elements: Element[] = [];
      const pointerEventsNoneElements: Element[] = [];
      const visit = (root: ParentNode) => {
        const children = root.querySelectorAll("*");
        for (const element of children) {
          if (element.shadowRoot && !isGrabUi(element)) visit(element.shadowRoot);
          elements.push(element);
          if (!isGrabUi(element) && getComputedStyle(element).pointerEvents === "none") {
            pointerEventsNoneElements.push(element);
          }
        }
      };
      visit(document.body);
      const seen = new Set<string>();
      const mismatches: string[] = [];
      let sampled = 0;
      const requiredIds = [
        "generic-hit-input",
        "generic-hit-select",
        "generic-hit-img",
        "generic-hit-canvas",
        "generic-hit-svg",
        "generic-hit-disabled",
        "generic-hit-pe-none",
        "generic-hit-same-box",
        "generic-hit-dynamic",
      ];
      const sawRequired = new Set<string>();
      for (const element of elements) {
        if (mismatches.length >= 8) break;
        if (isGrabUi(element) || element.closest("[data-react-grab-ignore]")) continue;
        if (!visible(element)) continue;
        const canvas = element.closest("[data-testid='three-js-canvas']");
        if (canvas) continue;
        element.scrollIntoView({ block: "center", inline: "center" });
        const rect = element.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
        const liveThreeRect = document
          .querySelector("[data-testid='three-js-canvas']")
          ?.getBoundingClientRect();
        if (liveThreeRect && containsPoint(liveThreeRect, x, y)) continue;
        const key = `${Math.round(x)}:${Math.round(y)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const dispatchPointer = (clientX: number, clientY: number) => {
          window.dispatchEvent(
            new PointerEvent("pointermove", {
              bubbles: true,
              clientX,
              clientY,
              isPrimary: true,
              pointerType: "mouse",
            }),
          );
        };
        const readSettledTarget = async () => {
          let current: Element | null = window.__REACT_GRAB__?.getState().targetElement ?? null;
          let stableReads = 0;
          const startedAt = performance.now();
          while (performance.now() - startedAt < 500) {
            await new Promise((resolve) => setTimeout(resolve, 20));
            const next = window.__REACT_GRAB__?.getState().targetElement ?? null;
            if (next === current) stableReads += 1;
            else {
              current = next;
              stableReads = 0;
            }
            if (stableReads >= 2 && performance.now() - startedAt >= waitMs) return current;
          }
          return current;
        };
        dispatchPointer(x, y);
        let actual = await readSettledTarget();
        let expected = expectedAt(x, y);
        if (actual !== expected) {
          dispatchPointer(x, y);
          actual = await readSettledTarget();
          expected = expectedAt(x, y);
        }
        sampled += 1;
        if (
          element.id &&
          requiredIds.includes(element.id) &&
          actual instanceof Element &&
          (actual === element || element.contains(actual))
        ) {
          sawRequired.add(element.id);
        }
        if (actual !== expected) {
          mismatches.push(
            `${describe(element)} @ ${Math.round(x)},${Math.round(y)} hover ${describe(actual)} expected ${describe(expected)}`,
          );
        }
      }
      for (const id of requiredIds) {
        if (!sawRequired.has(id)) mismatches.push(`missing selectable control ${id}`);
      }
      return { mismatches, sampled };
    }, SAMPLE_WAIT_MS);

    expect(result.sampled).toBeGreaterThan(20);
    expect(result.mismatches).toEqual([]);
  });
});
