// Pack scripts (G4 as changed 2026-11-23, _docs pack-scripts-and-signing.md §2c): a pack's one effect script runs in a QuickJS
// runtime inside a dedicated worker and draws only through the command API onto an overlay the app owns. These are the caps that
// hold every script, built-in or user, and the names of what a script sees. Constants and types only.

/** A script file is at most this many bytes (the validator's `script` rule; the server serves nothing larger). */
export const SCRIPT_MAX_BYTES = 65_536;
/** The guest's time in one frame, ms: the interrupt handler stops it there and the frame draws nothing. */
export const GUEST_MS = 2;
/** The guest's time to run its top level once, ms: past it the script is stopped. */
export const LOAD_MS = 50;
/** The host's own time in one frame (checking and drawing the commands), ms: past it the frame counts as over budget. */
export const HOST_MS = 6;
/** At most this many draw commands in a frame; the rest are dropped and the frame counts as over budget. */
export const COMMANDS_MAX = 2000;
/** At most this many points in one path, and in all of a frame's paths together. */
export const PATH_POINTS_MAX = 512;
export const FRAME_POINTS_MAX = 8000;
/** The guest's heap and stack, bytes. */
export const HEAP_BYTES = 8 * 1024 * 1024;
export const STACK_BYTES = 256 * 1024;
/** Frames a second at the Effects level Full and Calm. */
export const SCRIPT_FPS = { full: 30, calm: 15 } as const;
/** Signals change at most this often, ms (4 a second). */
export const SIGNAL_MS = 250;
/** The watchdog: this many frames over budget inside `windowMs` and the script gives way to the pack's declarative effects. */
export const WATCHDOG = { over: 3, windowMs: 10_000 } as const;
/** A frame the worker has not answered in this many ms ends the script (the worker is terminated). */
export const REPLY_MS = 1000;
/** The worker has this long to load the runtime and run the script's top level, ms. */
export const START_MS = 10_000;
/** A coordinate or length is held to ±this many px; a line is at most `LINE_MAX` px wide; a transform scales at most `SCALE_MAX` times. */
export const COORD_MAX = 8192;
export const LINE_MAX = 8;
export const SCALE_MAX = 4;
/** At most this many cards in the signals, and this many text boxes for each. */
export const CARDS_MAX = 64;
export const TEXTS_MAX = 16;

/** The widgets a script never reads (agent and chat): their zones are marked `data-fx-quiet` and send nothing. */
export const QUIET_MODULES: ReadonlySet<string> = new Set(["CodingAgents", "StreamChat"]);

/** A rectangle on the overlay, CSS px from its top left. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What a script reads of a card: its box, its bound value 0 to 1 in hundredths (null when the card has none), its threshold state, and its texts as boxes with a glyph count, never their characters. */
export interface CardSignal extends Box {
  value: number | null;
  state: "ok" | "warn" | "crit" | null;
  texts: (Box & { n: number })[];
}

/** `fx.signals()`: the Effects level, the overlay's size and the cards that may be read. */
export interface Signals {
  level: "full" | "calm";
  width: number;
  height: number;
  cards: CardSignal[];
}

/** How a script ended: `fallback` (the watchdog: too slow, the pack's declarative effects stay), `stopped` (it ran out of time or memory, threw, or stopped answering). */
export type ScriptEnd = "fallback" | "stopped";
