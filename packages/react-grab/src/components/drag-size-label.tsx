import { Show, type Component } from "solid-js";
import { REGION_LABEL_HEIGHT_PX, REGION_LABEL_OFFSET_PX } from "../constants.js";
import type { OverlayBounds } from "../types.js";
import { formatRegionSizeLabel } from "../utils/format-region-context.js";

interface DragSizeLabelProps {
  visible: boolean;
  bounds: OverlayBounds | undefined;
}

export const DragSizeLabel: Component<DragSizeLabelProps> = (props) => {
  const label = () =>
    props.bounds ? formatRegionSizeLabel(props.bounds.width, props.bounds.height) : "";

  const position = () => {
    const bounds = props.bounds;
    if (!bounds) return { x: 0, y: 0 };
    const fitsAbove = bounds.y > REGION_LABEL_HEIGHT_PX + REGION_LABEL_OFFSET_PX;
    return {
      x: bounds.x,
      y: fitsAbove
        ? bounds.y - REGION_LABEL_HEIGHT_PX - REGION_LABEL_OFFSET_PX
        : bounds.y + REGION_LABEL_OFFSET_PX,
    };
  };

  return (
    <Show when={props.visible && props.bounds}>
      <div
        data-react-grab-drag-size
        data-react-grab-ignore-events
        class="fixed pointer-events-none rounded-[4px] bg-[var(--rg-bg)] text-[var(--rg-text-primary)] text-[11px] leading-4 px-1.5 py-0.5 border border-[var(--rg-border)]"
        style={{
          left: `${position().x}px`,
          top: `${position().y}px`,
        }}
        textContent={label()}
      />
    </Show>
  );
};
