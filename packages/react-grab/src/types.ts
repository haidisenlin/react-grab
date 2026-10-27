import type { JSX } from "solid-js";

export interface Position {
  x: number;
  y: number;
}

export interface ElementAtPointOptions {
  container?: Element;
  filter?: (element: Element) => boolean;
}

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: string;
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object
    ? T[P] extends (...args: unknown[]) => unknown
      ? T[P]
      : DeepPartial<T[P]>
    : T[P];
};

export interface Theme {
  /**
   * Globally toggle the entire overlay
   * @default true
   */
  enabled?: boolean;
  /**
   * Base hue (0-360) used to generate colors throughout the interface using HSL color space
   * @default 0
   */
  hue?: number;
  /**
   * The highlight box that appears when hovering over an element before selecting it
   */
  selectionBox?: {
    /**
     * Whether to show the selection highlight
     * @default true
     */
    enabled?: boolean;
  };
  /**
   * The rectangular selection area that appears when clicking and dragging to select multiple elements
   */
  dragBox?: {
    /**
     * Whether to show the drag selection box
     * @default true
     */
    enabled?: boolean;
  };
  /**
   * Brief flash/highlight boxes that appear on elements immediately after they're successfully grabbed/copied
   */
  grabbedBoxes?: {
    /**
     * Whether to show these success flash effects
     * @default true
     */
    enabled?: boolean;
  };
  /**
   * The floating label that follows the cursor showing information about the currently hovered element
   */
  elementLabel?: {
    /**
     * Whether to show the label
     * @default true
     */
    enabled?: boolean;
  };
  /**
   * The floating toolbar that allows toggling React Grab activation
   */
  toolbar?: {
    /**
     * Whether to show the toolbar
     * @default true
     */
    enabled?: boolean;
  };
}

export interface ReactGrabState {
  isActive: boolean;
  isDragging: boolean;
  isCopying: boolean;
  isPromptMode: boolean;
  isSelectionBoxVisible: boolean;
  isDragBoxVisible: boolean;
  targetElement: Element | null;
  dragBounds: DragRect | null;
  regions: ReactGrabRegionState[];
  /**
   * Currently visible grabbed boxes (success flash effects).
   * These are temporary visual indicators shown after elements are grabbed/copied.
   */
  grabbedBoxes: Array<{
    id: string;
    bounds: OverlayBounds;
    createdAt: number;
  }>;
  labelInstances: Array<{
    id: string;
    status: SelectionLabelStatus;
    tagName: string;
    componentName?: string;
    createdAt: number;
  }>;
  selectionFilePath: string | null;
  toolbarState: ToolbarState | null;
}

export type ElementLabelVariant = "hover" | "processing" | "success";

export interface PromptModeContext {
  x: number;
  y: number;
  targetElement: Element | null;
}

export interface ElementLabelContext {
  x: number;
  y: number;
  content: string;
  element?: Element;
  tagName?: string;
  componentName?: string;
  filePath?: string;
  lineNumber?: number;
}

export type ActivationKey = string | ((event: KeyboardEvent) => boolean);

export interface AgentContext<T = unknown> {
  content: string[];
  prompt: string;
  options?: T;
  sessionId?: string;
}

export type ActivationMode = "toggle" | "hold";

export type OverlayDismissSource = "keyboard" | "pointer";

export interface OpenFileActionHooks {
  onOpenFile: (filePath: string, lineNumber?: number) => boolean | void;
  transformOpenFileUrl: (url: string, filePath: string, lineNumber?: number) => string;
}

export interface ActionContextHooks extends OpenFileActionHooks {
  transformHtmlContent: (html: string, elements: Element[]) => Promise<string>;
}

export interface ActionContext {
  element: Element;
  elements: Element[];
  filePath?: string;
  lineNumber?: number;
  componentName?: string;
  tagName?: string;
  enterPromptMode?: () => void;
  hooks: ActionContextHooks;
  performWithFeedback: (action: () => Promise<boolean>) => Promise<void>;
  hideContextMenu: () => void;
  cleanup: () => void;
}

export interface ContextMenuActionContext extends ActionContext {
  copy?: () => void;
}

export interface ContextMenuAction {
  id: string;
  label: string;
  shortcut?: string;
  shortcutModifier?: boolean;
  showInToolbarMenu?: boolean;
  enabled?: boolean | ((context: ActionContext) => boolean);
  onAction: (context: ContextMenuActionContext) => void | Promise<void>;
}

// A predicate over a DOM element (e.g. "is this element grabbable?").
export interface ElementPredicate {
  (element: Element): boolean;
}

// A single rendered row of the hierarchy dropdown (renderer-facing: no element
// reference, only what is drawn).
export interface HierarchyItem {
  tagName: string;
  componentName?: string;
  // Indentation level within the hierarchy tree (0 = outermost ancestor).
  depth: number;
  // Whether this row is the last among its displayed siblings, used to pick
  // the terminal-style connector glyph (└─ vs ├─).
  isLast: boolean;
}

// Internal hierarchy node that pairs a real DOM element with its position in
// the rendered ancestor/sibling/child tree. The element reference is kept in
// core (never sent to the renderer).
export interface HierarchyEntry {
  element: Element;
  depth: number;
  isLast: boolean;
}

export interface HierarchyState {
  items: HierarchyItem[];
  activeIndex: number;
}

export interface PerformWithFeedbackOptions {
  fallbackBounds?: OverlayBounds;
  fallbackSelectionBounds?: OverlayBounds[];
  position?: Position;
}

export interface PluginHooks {
  onActivate?: () => void | Promise<void>;
  onDeactivate?: () => void | Promise<void>;
  onElementHover?: (element: Element) => void | Promise<void>;
  onElementSelect?: (element: Element) => boolean | void | Promise<boolean>;
  onDragStart?: (startX: number, startY: number) => void | Promise<void>;
  /**
   * @deprecated Selection-mode drags commit a region. This still fires with the
   * elements that overlap that region, sorted by how much of the region they
   * cover. Prefer `onRegionSelect`.
   */
  onDragEnd?: (elements: Element[], bounds: DragRect) => void | Promise<void>;
  onRegionSelect?: (region: RegionSelectionPayload) => void | Promise<void>;
  onSelectionImages?: (images: SelectionImageSet) => void | Promise<void>;
  onBeforeCopy?: (elements: Element[]) => void | Promise<void>;
  transformCopyContent?: (content: string, elements: Element[]) => string | Promise<string>;
  onAfterCopy?: (elements: Element[], success: boolean) => void | Promise<void>;
  onCopySuccess?: (elements: Element[], content: string) => void | Promise<void>;
  onCopyError?: (error: Error) => void | Promise<void>;
  onStateChange?: (state: ReactGrabState) => void | Promise<void>;
  onPromptModeChange?: (isPromptMode: boolean, context: PromptModeContext) => void | Promise<void>;
  onSelectionBox?: (
    visible: boolean,
    bounds: OverlayBounds | null,
    element: Element | null,
  ) => void | Promise<void>;
  onDragBox?: (visible: boolean, bounds: OverlayBounds | null) => void | Promise<void>;
  onGrabbedBox?: (bounds: OverlayBounds, element: Element) => void | Promise<void>;
  onElementLabel?: (
    visible: boolean,
    variant: ElementLabelVariant,
    context: ElementLabelContext,
  ) => void | Promise<void>;
  onContextMenu?: (element: Element, position: Position) => void | Promise<void>;
  onOpenFile?: (filePath: string, lineNumber?: number) => boolean | void;
  transformHtmlContent?: (html: string, elements: Element[]) => string | Promise<string>;
  transformAgentContext?: (
    context: AgentContext,
    elements: Element[],
  ) => AgentContext | Promise<AgentContext>;
  transformActionContext?: (context: ActionContext) => ActionContext;
  transformOpenFileUrl?: (url: string, filePath: string, lineNumber?: number) => string;
}

export interface PluginConfig {
  theme?: DeepPartial<Theme>;
  options?: SettableOptions;
  actions?: ContextMenuAction[];
  hooks?: PluginHooks;
  cleanup?: () => undefined;
}

export interface Plugin {
  name: string;
  theme?: DeepPartial<Theme>;
  options?: SettableOptions;
  actions?: ContextMenuAction[];
  hooks?: PluginHooks;
  setup?: (api: ReactGrabAPI, hooks: ActionContextHooks) => PluginConfig | void;
}

export interface Options {
  enabled?: boolean;
  /**
   * Confine React Grab to a single container element instead of the whole page.
   * Hit-testing, the toolbar viewport, and scroll re-anchoring are scoped to it.
   * Used by the demo build to scope the showcase to its card.
   */
  container?: HTMLElement;
  activationMode?: ActivationMode;
  keyHoldDuration?: number;
  allowActivationInsideInput?: boolean;
  activationKey?: ActivationKey;
  getContent?: (elements: Element[]) => Promise<string> | string;
  /**
   * Maximum number of source-location lines included in the copied / prompted
   * context for a grabbed element. Larger apps often render a target through
   * several wrapper components, so the compact default can point an agent at a
   * wrapper instead of the meaningful surface. Raise this to opt into a deeper,
   * more detailed trace. Low-signal library frames are always surfaced for free
   * and never count against this budget.
   * @default 3
   */
  maxContextLines?: number;
  /**
   * Whether to freeze React state updates while React Grab is active.
   * This prevents UI changes from interfering with element selection.
   * @default true
   */
  freezeReactUpdates?: boolean;
  /**
   * Whether to send the anonymous version check to react-grab.com on init.
   * Set to false to skip the version-check request.
   * @default true
   */
  telemetry?: boolean;
}

export interface SettableOptions extends Options {
  enabled?: never;
  telemetry?: never;
  container?: never;
}

export interface SourceInfo {
  filePath: string;
  lineNumber: number | null;
  columnNumber: number | null;
  componentName: string | null;
}

export interface SelectedElementPayload {
  tagName: string;
  id?: string;
  className?: string;
  textContent?: string;
  componentName?: string;
  filePath?: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface ElementSelectedEventDetail {
  elements: SelectedElementPayload[];
}

export interface RegionSelectedEventDetail {
  type: "region";
  regions: RegionSelectionPayload[];
}

declare global {
  interface WindowEventMap {
    "react-grab:element-selected": CustomEvent<ElementSelectedEventDetail>;
    "react-grab:region-selected": CustomEvent<RegionSelectedEventDetail>;
  }
}

export interface ToolbarState {
  edge: "top" | "bottom" | "left" | "right";
  ratio: number;
  collapsed: boolean;
  enabled: boolean;
  defaultAction?: string;
}

export interface DropdownAnchor {
  x: number;
  y: number;
  edge: ToolbarState["edge"];
}

export interface ReactGrabAPI {
  activate: () => void;
  deactivate: () => void;
  toggle: () => void;
  comment: () => void;
  isActive: () => boolean;
  isEnabled: () => boolean;
  setEnabled: (enabled: boolean) => void;
  getToolbarState: () => ToolbarState | null;
  setToolbarState: (state: Partial<ToolbarState>) => void;
  onToolbarStateChange: (callback: (state: ToolbarState) => void) => () => void;
  reset: () => void;
  dispose: () => void;
  copyElement: (elements: Element | Element[]) => Promise<boolean>;
  getSource: (element: Element) => Promise<SourceInfo | null>;
  getStackContext: (element: Element) => Promise<string>;
  getRegionContext: (region: {
    x: number;
    y: number;
    width: number;
    height: number;
    anchor?: RegionAnchor;
    note?: string;
  }) => Promise<string>;
  getSelectionImages: () => Promise<SelectionImageSet | null>;
  zoom: (target: AxisRect | string) => Promise<SelectionZoomImage | null>;
  getState: () => ReactGrabState;
  setOptions: (options: SettableOptions) => void;
  registerPlugin: (plugin: Plugin) => void;
  unregisterPlugin: (name: string) => void;
  getPlugins: () => string[];
  getDisplayName: (element: Element) => string | null;
}

export interface OverlayBounds {
  borderRadius: string;
  height: number;
  width: number;
  x: number;
  y: number;
}

export type SelectionLabelStatus = "idle" | "copying" | "copied" | "fading" | "error";

export interface SelectionLabelInstance {
  id: string;
  bounds: OverlayBounds;
  boundsMultiple?: OverlayBounds[];
  tagName: string;
  componentName?: string;
  elementsCount?: number;
  status: SelectionLabelStatus;
  statusText?: string;
  isPromptMode?: boolean;
  inputValue?: string;
  createdAt: number;
  element?: Element;
  elements?: Element[];
  mouseX?: number;
  mouseXOffsetFromCenter?: number;
  mouseXOffsetRatio?: number;
  errorMessage?: string;
  hideArrow?: boolean;
}

export interface FrozenLabelEntry {
  tagName: string;
  componentName?: string;
  bounds: OverlayBounds;
  mouseX?: number;
}

export interface FrozenLabelEntryAccessor {
  read: () => FrozenLabelEntry | null;
}

export interface SelectionLabelInstanceAccessor {
  read: () => SelectionLabelInstance | null;
}

export interface ReactGrabRendererProps {
  selectionVisible?: boolean;
  selectionBounds?: OverlayBounds;
  selectionBoundsMultiple?: OverlayBounds[];
  selectionShouldSnap?: boolean;
  selectionElementsCount?: number;
  frozenLabelEntryAccessors?: FrozenLabelEntryAccessor[];
  pendingShiftPreviewEntry?: FrozenLabelEntry;
  selectionFilePath?: string;
  selectionTagName?: string;
  selectionComponentName?: string;
  selectionLabelVisible?: boolean;
  selectionLabelStatus?: SelectionLabelStatus;
  hierarchyState?: HierarchyState;
  hierarchyMenuPosition?: DropdownAnchor | null;
  labelInstances?: SelectionLabelInstance[];
  labelInstanceAccessors?: SelectionLabelInstanceAccessor[];
  dragVisible?: boolean;
  dragBounds?: OverlayBounds;
  regionOverlays?: RegionOverlayModel[];
  onRegionGeometryChange?: (regionId: string, next: AxisRect) => void;
  onRegionRemove?: (regionId: string) => void;
  regionOverlaps?: RegionOverlapItem[];
  onRemoveRegionOverlap?: (overlapId: string) => void;
  grabbedBoxes?: Array<{
    id: string;
    bounds: OverlayBounds;
    createdAt: number;
  }>;
  mouseX?: number;
  isFrozen?: boolean;
  inputValue?: string;
  inputPlaceholder?: string;
  isPromptMode?: boolean;
  onShowContextMenuInstance?: (instanceId: string) => void;
  onRetryInstance?: (instanceId: string) => void;
  onAcknowledgeErrorInstance?: (instanceId: string) => void;
  onLabelInstanceHoverChange?: (instanceId: string, isHovered: boolean) => void;
  onInputChange?: (value: string) => void;
  onInputSubmit?: () => void;
  selectionLabelShakeCount?: number;
  onConfirmDismiss?: () => void;
  onOpenSelectionFile?: () => void;
  discardPrompt?: SelectionDiscardPrompt;
  toolbarVisible?: boolean;
  isActive?: boolean;
  onToggleActive?: () => void;
  activeActionId?: string | null;
  enabled?: boolean;
  shakeCount?: number;
  onToolbarStateChange?: (state: ToolbarState) => void;
  onSubscribeToToolbarStateChanges?: (callback: (state: ToolbarState) => void) => () => void;
  onToolbarSelectHoverChange?: (isHovered: boolean) => void;
  onToolbarRef?: (element: HTMLDivElement) => void;
  contextMenuPosition?: Position | null;
  contextMenuBounds?: OverlayBounds | null;
  contextMenuTagName?: string;
  contextMenuComponentName?: string;
  contextMenuHasFilePath?: boolean;
  actions?: ContextMenuAction[];
  actionContext?: ActionContext;
  onContextMenuDismiss?: () => void;
  onContextMenuHide?: () => void;
  toolbarMenuPosition?: DropdownAnchor | null;
  toolbarMenuActions?: ContextMenuAction[];
  defaultActionId?: string;
  defaultActionLabel?: string;
  onSetDefaultAction?: (actionId: string) => void;
  onToggleToolbarMenu?: () => void;
  onToolbarMenuDismiss?: () => void;
}

export interface GrabbedBox {
  id: string;
  bounds: OverlayBounds;
  createdAt: number;
  element?: Element;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface DragRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ArrowPosition = "bottom" | "top";

export interface ArrowProps {
  position: ArrowPosition;
  leftPercent: number;
  leftOffsetPx: number;
  labelWidth?: number;
}

export interface TagBadgeProps {
  tagName: string;
  componentName?: string;
  isClickable: boolean;
  onClick: (event: MouseEvent) => void;
  onHoverChange?: (hovered: boolean) => void;
  shrink?: boolean;
}

export interface BottomSectionProps {
  children: JSX.Element;
}

export interface DiscardPromptProps {
  label?: string;
  showCancel?: boolean;
  cancelOnEscape?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  onCopy?: () => void;
}

export interface SelectionDiscardPrompt {
  isKeyboardSelection?: boolean;
  label?: string;
  cancelOnEscape?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  onCopy?: () => void;
}

export interface ErrorViewProps {
  error: string;
  onAcknowledge?: () => void;
  onRetry?: () => void;
}

export interface CompletionViewProps {
  statusText: string;
  onDismiss?: () => void;
  onFadingChange?: (isFading: boolean) => void;
  onShowContextMenu?: () => void;
}

export interface SelectionLabelProps {
  tagName?: string;
  componentName?: string;
  elementsCount?: number;
  selectionBounds?: OverlayBounds;
  mouseX?: number;
  visible?: boolean;
  isPromptMode?: boolean;
  inputValue?: string;
  inputPlaceholder?: string;
  status?: SelectionLabelStatus;
  statusText?: string;
  filePath?: string;
  onInputChange?: (value: string) => void;
  onSubmit?: () => void;
  onOpen?: () => void;
  onDismiss?: () => void;
  selectionLabelShakeCount?: number;
  onConfirmDismiss?: () => void;
  discardPrompt?: SelectionDiscardPrompt;
  error?: string;
  onAcknowledgeError?: () => void;
  onRetry?: () => void;
  onShowContextMenu?: () => void;
  onHoverChange?: (isHovered: boolean) => void;
  hideArrow?: boolean;
  regionOverlaps?: RegionOverlapItem[];
  onRemoveRegionOverlap?: (overlapId: string) => void;
}

export interface SourceLocation extends SourceInfo {
  columnNumber: number | null;
}

export interface ReactGrabStackFrame {
  functionName?: string;
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
  isServer?: boolean;
  isSymbolicated?: boolean;
}

export type RegionAnchor = "page" | "viewport";

export interface AxisRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RegionMeasurement {
  anchor: RegionAnchor;
  viewport: AxisRect;
  page: AxisRect;
  viewportPercent: AxisRect;
  documentPercent: AxisRect;
}

export interface RegionOverlayModel {
  id: string;
  anchor: RegionAnchor;
  x: number;
  y: number;
  width: number;
  height: number;
  bounds: OverlayBounds;
}

export interface ReactGrabRegionState {
  id: string;
  anchor: RegionAnchor;
  bounds: DragRect;
  pageBounds: DragRect;
}

export interface VisualViewportFrame {
  scale: number;
  offsetLeft: number;
  offsetTop: number;
  width: number;
  height: number;
}

export interface ScrollContainerFrame {
  label: string;
  rect: AxisRect;
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
  scrollHeight: number;
}

export interface AncestorTransformFrame {
  label: string;
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
  screenRect: AxisRect;
}

export interface BrowserZoomEstimate {
  ratio: number;
  percent: number;
  estimate: true;
}

export interface CoordinateFrame {
  summary: string;
  viewport: { width: number; height: number };
  visualViewport: VisualViewportFrame | null;
  document: { width: number; height: number; scrollX: number; scrollY: number };
  devicePixelRatio: number;
  browserZoom: BrowserZoomEstimate;
  scrollContainers: ScrollContainerFrame[];
  ancestorTransforms: AncestorTransformFrame[];
  screenRect: AxisRect;
  localRect: AxisRect;
}

export interface SelectionAnnotation {
  image_ref: string;
  crop_rect_css: AxisRect;
  region_rect_in_crop_px: AxisRect;
  scale: number;
  overview_box_px: AxisRect;
  token_estimate: number;
  pixel_width: number;
  pixel_height: number;
  numbers: number[];
  coordinate_frame: CoordinateFrame;
}

export interface SelectionImageRecord {
  image_ref: string;
  css_rect: AxisRect;
  pixel_width: number;
  pixel_height: number;
  scale: number;
  token_estimate: number;
  data_url: string;
  blob: Blob;
  coordinate_frame: CoordinateFrame;
}

export interface SelectionImageSet {
  overview: SelectionImageRecord;
  crops: SelectionImageRecord[];
  annotations: SelectionAnnotation[];
}

export interface SelectionZoomImage {
  image_ref: string;
  css_rect: AxisRect;
  pixel_width: number;
  pixel_height: number;
  scale: number;
  token_estimate: number;
  data_url: string;
  blob: Blob;
  coordinate_frame: CoordinateFrame;
}

export interface RegionOverlapSnapshot {
  label: string;
  selector: string | null;
  regionCoverage: number;
  elementCoverage: number;
}

export interface RegionOverlapItem {
  id: string;
  label: string;
  selector: string | null;
  regionCoverage: number;
  elementCoverage: number;
}

export interface RegionSelectionPayload {
  type: "region";
  id: string;
  text: string;
  note: string;
  isEmpty: boolean;
  anchor: RegionAnchor;
  measurement: RegionMeasurement;
  ancestorLabel: string | null;
  ancestorSelector: string | null;
  coordinateFrame: CoordinateFrame | null;
  overlaps: RegionOverlapSnapshot[];
}

export interface ReactGrabEntry {
  type?: "element" | "region";
  tagName?: string;
  componentName?: string;
  content: string;
  commentText?: string;
  source?: SourceLocation | null;
  stackContext?: string;
  frames?: ReactGrabStackFrame[];
  region?: RegionSelectionPayload;
  coordinateFrame?: CoordinateFrame | null;
}
