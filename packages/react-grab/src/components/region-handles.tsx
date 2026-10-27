import { Index, type Component } from "solid-js";
import { REGION_MIN_SIZE_PX, REGION_RESIZE_HANDLE_PX } from "../constants.js";
import type { AxisRect, RegionOverlayModel } from "../types.js";
import { formatRegionSizeLabel } from "../utils/format-region-context.js";

type RegionHandleEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "move";

interface RegionHandlesProps {
  regions: RegionOverlayModel[];
  onChange: (regionId: string, next: AxisRect) => void;
  onRemove: (regionId: string) => void;
}

const cursorForEdge = (edge: RegionHandleEdge): string => {
  if (edge === "move") return "move";
  if (edge === "n" || edge === "s") return "ns-resize";
  if (edge === "e" || edge === "w") return "ew-resize";
  return `${edge}-resize`;
};

const edgeAtPoint = (
  bounds: { x: number; y: number; width: number; height: number },
  clientX: number,
  clientY: number,
): RegionHandleEdge => {
  const localX = clientX - bounds.x;
  const localY = clientY - bounds.y;
  const nearLeft = localX <= REGION_RESIZE_HANDLE_PX;
  const nearRight = bounds.width - localX <= REGION_RESIZE_HANDLE_PX;
  const nearTop = localY <= REGION_RESIZE_HANDLE_PX;
  const nearBottom = bounds.height - localY <= REGION_RESIZE_HANDLE_PX;
  if (nearTop && nearLeft) return "nw";
  if (nearTop && nearRight) return "ne";
  if (nearBottom && nearLeft) return "sw";
  if (nearBottom && nearRight) return "se";
  if (nearTop) return "n";
  if (nearBottom) return "s";
  if (nearLeft) return "w";
  if (nearRight) return "e";
  return "move";
};

export const RegionHandles: Component<RegionHandlesProps> = (props) => {
  return (
    <Index each={props.regions}>
      {(region) => {
        let activeEdge: RegionHandleEdge = "move";
        let originClientX = 0;
        let originClientY = 0;
        let originRect: AxisRect = { x: 0, y: 0, width: 0, height: 0 };

        const applyDelta = (clientX: number, clientY: number) => {
          const deltaX = clientX - originClientX;
          const deltaY = clientY - originClientY;
          let nextX = originRect.x;
          let nextY = originRect.y;
          let nextWidth = originRect.width;
          let nextHeight = originRect.height;
          const edge = activeEdge;
          if (edge === "move") {
            nextX += deltaX;
            nextY += deltaY;
          } else {
            if (edge.includes("w")) {
              nextX += deltaX;
              nextWidth -= deltaX;
            }
            if (edge.includes("e")) nextWidth += deltaX;
            if (edge.includes("n")) {
              nextY += deltaY;
              nextHeight -= deltaY;
            }
            if (edge.includes("s")) nextHeight += deltaY;
          }
          if (nextWidth < REGION_MIN_SIZE_PX) {
            if (edge.includes("w")) nextX -= REGION_MIN_SIZE_PX - nextWidth;
            nextWidth = REGION_MIN_SIZE_PX;
          }
          if (nextHeight < REGION_MIN_SIZE_PX) {
            if (edge.includes("n")) nextY -= REGION_MIN_SIZE_PX - nextHeight;
            nextHeight = REGION_MIN_SIZE_PX;
          }
          props.onChange(region().id, {
            x: nextX,
            y: nextY,
            width: nextWidth,
            height: nextHeight,
          });
        };

        return (
          <div
            data-react-grab-region
            data-react-grab-ignore-events
            class="fixed"
            style={{
              left: `${region().bounds.x}px`,
              top: `${region().bounds.y}px`,
              width: `${region().bounds.width}px`,
              height: `${region().bounds.height}px`,
              "pointer-events": "auto",
              cursor: "move",
            }}
            onPointerMove={(event) => {
              const edge = edgeAtPoint(region().bounds, event.clientX, event.clientY);
              event.currentTarget.style.cursor = cursorForEdge(edge);
            }}
            on:pointerdown={(event) => {
              if (event.button !== 0) return;
              const eventTarget = event.target;
              if (
                eventTarget instanceof Element &&
                eventTarget.closest("[data-react-grab-region-delete]")
              ) {
                return;
              }
              event.preventDefault();
              event.stopImmediatePropagation();
              activeEdge = edgeAtPoint(region().bounds, event.clientX, event.clientY);
              originClientX = event.clientX;
              originClientY = event.clientY;
              const currentRegion = region();
              originRect = {
                x: currentRegion.x,
                y: currentRegion.y,
                width: currentRegion.width,
                height: currentRegion.height,
              };
              const handlePointerMove = (moveEvent: PointerEvent) => {
                applyDelta(moveEvent.clientX, moveEvent.clientY);
              };
              const handlePointerUp = () => {
                window.removeEventListener("pointermove", handlePointerMove, true);
                window.removeEventListener("pointerup", handlePointerUp, true);
              };
              window.addEventListener("pointermove", handlePointerMove, true);
              window.addEventListener("pointerup", handlePointerUp, true);
            }}
          >
            <button
              type="button"
              data-react-grab-region-delete
              data-react-grab-ignore-events
              aria-label="Remove region"
              class="absolute -top-2 -right-2 flex size-4 items-center justify-center rounded-full border-none bg-[var(--rg-bg)] text-[var(--rg-text-primary)] text-[11px] leading-none cursor-pointer p-0"
              on:pointerdown={(event) => {
                event.preventDefault();
                event.stopImmediatePropagation();
              }}
              onClick={() => props.onRemove(region().id)}
            >
              ×
            </button>
            <div
              data-react-grab-ignore-events
              class="pointer-events-none absolute left-1 bottom-1 rounded-[4px] bg-[var(--rg-bg)] text-[var(--rg-text-primary)] text-[11px] leading-4 px-1"
              textContent={formatRegionSizeLabel(region().width, region().height)}
            />
          </div>
        );
      }}
    </Index>
  );
};
