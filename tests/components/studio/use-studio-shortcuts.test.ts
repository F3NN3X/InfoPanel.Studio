import { describe, expect, it } from "vitest";
import { shortcutAction, type KeyInput, type ShortcutContext } from "@/components/studio/use-studio-shortcuts";

const key = (k: string, mods: Partial<Omit<KeyInput, "key">> = {}): KeyInput => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

const IDLE: ShortcutContext = { typing: false, overlay: false };
const TYPING: ShortcutContext = { typing: true, overlay: false };
const DIALOG: ShortcutContext = { typing: false, overlay: true };

describe("shortcutAction", () => {
  it("maps the plain zone keys", () => {
    expect(shortcutAction(key("Delete"), IDLE)).toEqual({ type: "remove" });
    expect(shortcutAction(key("Backspace"), IDLE)).toEqual({ type: "remove" });
    expect(shortcutAction(key("h"), IDLE)).toEqual({ type: "toggle-visible" });
    expect(shortcutAction(key("Escape"), IDLE)).toEqual({ type: "escape" });
    expect(shortcutAction(key("?", { shiftKey: true }), IDLE)).toEqual({ type: "cheatsheet" });
  });

  it("maps the ctrl (and cmd) shortcuts", () => {
    expect(shortcutAction(key("s", { ctrlKey: true }), IDLE)).toEqual({ type: "save" });
    expect(shortcutAction(key("z", { ctrlKey: true }), IDLE)).toEqual({ type: "undo" });
    expect(shortcutAction(key("Z", { ctrlKey: true, shiftKey: true }), IDLE)).toEqual({ type: "redo" });
    expect(shortcutAction(key("y", { ctrlKey: true }), IDLE)).toEqual({ type: "redo" });
    expect(shortcutAction(key("d", { metaKey: true }), IDLE)).toEqual({ type: "duplicate" });
    expect(shortcutAction(key("k", { ctrlKey: true }), IDLE)).toEqual({ type: "palette" });
    expect(shortcutAction(key("0", { ctrlKey: true }), IDLE)).toEqual({ type: "zoom-fit" });
    expect(shortcutAction(key("=", { ctrlKey: true }), IDLE)).toEqual({ type: "zoom-in" });
    expect(shortcutAction(key("+", { ctrlKey: true, shiftKey: true }), IDLE)).toEqual({ type: "zoom-in" });
    expect(shortcutAction(key("-", { ctrlKey: true }), IDLE)).toEqual({ type: "zoom-out" });
  });

  it("ignores plain keys while typing, but keeps save and the palette", () => {
    expect(shortcutAction(key("Delete"), TYPING)).toBeNull();
    expect(shortcutAction(key("Backspace"), TYPING)).toBeNull();
    expect(shortcutAction(key("h"), TYPING)).toBeNull();
    expect(shortcutAction(key("ArrowLeft"), TYPING)).toBeNull();
    expect(shortcutAction(key("?"), TYPING)).toBeNull();
    expect(shortcutAction(key("d", { ctrlKey: true }), TYPING)).toBeNull();
    expect(shortcutAction(key("0", { ctrlKey: true }), TYPING)).toBeNull();
    expect(shortcutAction(key("s", { ctrlKey: true }), TYPING)).toEqual({ type: "save" });
    expect(shortcutAction(key("k", { ctrlKey: true }), TYPING)).toEqual({ type: "palette" });
  });

  it("leaves Esc and plain keys to an open dialog, keeping save and undo/redo", () => {
    expect(shortcutAction(key("Escape"), DIALOG)).toBeNull();
    expect(shortcutAction(key("Delete"), DIALOG)).toBeNull();
    expect(shortcutAction(key("ArrowDown"), DIALOG)).toBeNull();
    expect(shortcutAction(key("k", { ctrlKey: true }), DIALOG)).toBeNull();
    expect(shortcutAction(key("s", { ctrlKey: true }), DIALOG)).toEqual({ type: "save" });
    expect(shortcutAction(key("z", { ctrlKey: true }), DIALOG)).toEqual({ type: "undo" });
  });

  describe("with a panel widget selected", () => {
    const WIDGET: ShortcutContext = { ...IDLE, widget: true };

    it("removes and duplicates the widget instead of the zone", () => {
      expect(shortcutAction(key("Delete"), WIDGET)).toEqual({ type: "widget-remove" });
      expect(shortcutAction(key("Backspace"), WIDGET)).toEqual({ type: "widget-remove" });
      expect(shortcutAction(key("d", { ctrlKey: true }), WIDGET)).toEqual({ type: "widget-duplicate" });
    });

    it("keeps the arrows on the zone, and Esc, save and undo as they are", () => {
      expect(shortcutAction(key("ArrowRight"), WIDGET)).toEqual({ type: "nudge", cols: 1, rows: 0 });
      expect(shortcutAction(key("ArrowDown", { shiftKey: true }), WIDGET)).toEqual({ type: "resize", cols: 0, rows: 1 });
      expect(shortcutAction(key("Escape"), WIDGET)).toEqual({ type: "escape" });
      expect(shortcutAction(key("z", { ctrlKey: true }), WIDGET)).toEqual({ type: "undo" });
      expect(shortcutAction(key("h"), WIDGET)).toEqual({ type: "toggle-visible" });
    });

    it("leaves the widget keys to text fields and dialogs", () => {
      const typing = { ...WIDGET, typing: true };
      const dialog = { ...WIDGET, overlay: true };
      expect(shortcutAction(key("c", { ctrlKey: true }), typing)).toBeNull();
      expect(shortcutAction(key("v", { ctrlKey: true }), typing)).toBeNull();
      expect(shortcutAction(key("Delete"), typing)).toBeNull();
      expect(shortcutAction(key("ArrowUp", { altKey: true }), typing)).toBeNull();
      expect(shortcutAction(key("c", { ctrlKey: true }), dialog)).toBeNull();
      expect(shortcutAction(key("Delete"), dialog)).toBeNull();
      expect(shortcutAction(key("z", { ctrlKey: true }), typing)).toBeNull(); // the text field's own undo
    });
  });
});

describe("shortcutAction guards", () => {
  it("leaves Esc and undo / redo to a text field while typing", () => {
    expect(shortcutAction(key("Escape"), TYPING)).toBeNull();
    expect(shortcutAction(key("z", { ctrlKey: true }), TYPING)).toBeNull();
    expect(shortcutAction(key("z", { ctrlKey: true, shiftKey: true }), TYPING)).toBeNull();
    expect(shortcutAction(key("y", { ctrlKey: true }), TYPING)).toBeNull();
    expect(shortcutAction(key("z", { ctrlKey: true }), DIALOG)).toEqual({ type: "undo" });
  });

  it("ignores every key during a drag", () => {
    const dragging = { ...IDLE, dragging: true };
    for (const k of [key("Delete"), key("h"), key("Escape"), key("ArrowLeft"), key("z", { ctrlKey: true }), key("d", { ctrlKey: true })]) {
      expect(shortcutAction(k, dragging)).toBeNull();
    }
  });

});

describe("page shortcuts", () => {
  it("steps pages with Ctrl+PageDown / PageUp (cmd too)", () => {
    expect(shortcutAction(key("PageDown", { ctrlKey: true }), IDLE)).toEqual({ type: "page-next" });
    expect(shortcutAction(key("PageUp", { ctrlKey: true }), IDLE)).toEqual({ type: "page-prev" });
    expect(shortcutAction(key("PageDown", { metaKey: true }), IDLE)).toEqual({ type: "page-next" });
  });


describe("align and distribute keys", () => {
  const ctx = { typing: false, overlay: false };
  const alt = (code: string, mods: Partial<KeyInput> = {}) => key(code.slice(3).toLowerCase(), { altKey: true, code, ...mods });

  it("maps Alt+A / D / W / S to the four aligns and Alt+Shift+H / V to distribute", () => {
    expect(shortcutAction(alt("KeyA"), ctx)).toEqual({ type: "arrange", op: "align-left" });
    expect(shortcutAction(alt("KeyD"), ctx)).toEqual({ type: "arrange", op: "align-right" });
    expect(shortcutAction(alt("KeyW"), ctx)).toEqual({ type: "arrange", op: "align-top" });
    expect(shortcutAction(alt("KeyS"), ctx)).toEqual({ type: "arrange", op: "align-bottom" });
    expect(shortcutAction(alt("KeyH", { shiftKey: true }), ctx)).toEqual({ type: "arrange", op: "distribute-h" });
    expect(shortcutAction(alt("KeyV", { shiftKey: true }), ctx)).toEqual({ type: "arrange", op: "distribute-v" });
  });

  it("leaves Ctrl+Alt+C / V to the style copy, and text fields and AltGr to themselves", () => {
    expect(shortcutAction(alt("KeyC", { ctrlKey: true }), ctx)).toEqual({ type: "copy-style" });
    expect(shortcutAction(alt("KeyA"), { ...ctx, typing: true })).toBeNull();
    expect(shortcutAction(alt("KeyA", { altGraph: true }), ctx)).toBeNull();
    expect(shortcutAction(alt("KeyA", { ctrlKey: true }), ctx)).toBeNull();
  });
});
});
