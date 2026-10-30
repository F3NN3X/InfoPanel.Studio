// The touch stream's messages (GET /events/touch?panel=<id>, experimental touch): touch-core's DeviceMsg as touch-kit
// sends it (packages/touch-kit-web/src/types.ts at v1.2.1), plus Studio's own `Stopped` status, the page's `Offline`
// and the panel's setup. Coordinates are panel pixels (physical).

export type Status =
  | { status: "Connected"; interface: number; report_len: number; port: string }
  | { status: "Disconnected" }
  | { status: "Error"; message: string }
  /** Touch is off in Studio, or the panel was removed from touch.json. */
  | { status: "Stopped" }
  /** The page lost its connection to Studio's server (never sent; the page's own). */
  | { status: "Offline" };

export interface PointerMsg {
  type: "Pointer";
  kind: "Down" | "Move" | "Up";
  id: number;
  x: number;
  y: number;
  t_ms: number;
}

export type Dir = "Left" | "Right" | "Up" | "Down";

export type Gesture =
  | { type: "Tap" }
  | { type: "DoubleTap" }
  | { type: "LongPress" }
  | { type: "LongPressRepeat"; n: number }
  | { type: "DragStart" }
  | { type: "DragMove"; dx: number; dy: number }
  | { type: "DragEnd" }
  | { type: "Swipe"; dir: Dir; fingers: number }
  | { type: "PinchStart" }
  | { type: "Pinch"; scale: number }
  | { type: "PinchEnd" }
  | { type: "ThreeFingerTap" };

export interface GestureMsg {
  type: "Gesture";
  gesture: Gesture;
  x: number;
  y: number;
  t_ms: number;
}

export type DeviceMsg = Status | PointerMsg | GestureMsg;

/** What touch.json says a recognised gesture does on the kiosk. */
export type Action =
  | { action: "toggle_debug" }
  | { action: "page"; to: "next" | "prev" }
  | { action: "emit"; name: string }
  | { action: "log" };

/** The panel and the kiosk's touch settings; sent before the touches and again when touch.json changes. */
export interface Setup {
  name: string;
  width_px: number;
  height_px: number;
  /** How far ahead touch dots draw a moving contact, ms. */
  prediction_ms: number;
  touch_dots: boolean;
  debug: boolean;
  /** Movement (panel px) beyond which a lift is no longer a tap. */
  slop_px: number;
  /** Keyed by `gestureKey`. */
  actions: Record<string, Action>;
}

export interface SetupMsg {
  setup: Setup;
}

export type TouchMsg = DeviceMsg | SetupMsg;

export const isStatus = (m: TouchMsg): m is Status => "status" in m;
export const isSetup = (m: TouchMsg): m is SetupMsg => "setup" in m;
