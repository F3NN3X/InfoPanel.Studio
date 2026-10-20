import { describe, expect, it } from "vitest";
import { gaugeEntryOf, presetGauges, type GaugeEntry } from "@/lib/gauge-studio/model";
import { editorOpenOf, historyKey, newGaugeOpen } from "@/lib/gauge-studio/open";
import { DEFAULT_GAUGE } from "@/lib/infopanel/gauges/vector";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe("editorOpenOf", () => {
  it("opens a preset as a copy named after it, with nowhere to save back to", () => {
    const preset = presetGauges()[0];
    expect(editorOpenOf(preset)).toEqual({ kind: "copy", name: `${preset.name} copy`, gauge: preset.gauge, origin: null });
  });

  it("opens a library item as itself, so Save updates it", () => {
    const entry = gaugeEntryOf({ kind: "library", itemId: "a" }, "Mine", DEFAULT_GAUGE, "My library");
    expect(editorOpenOf(entry)).toEqual({ kind: "copy", name: "Mine", gauge: DEFAULT_GAUGE, origin: { kind: "library", itemId: "a" } });
  });

  it("opens a profile gauge in place (a canvas image sequence too), and a library image sequence as frames", () => {
    const widget = gaugeEntryOf({ kind: "widget", zoneId: "z" }, "CPU", DEFAULT_GAUGE, "Home");
    expect(editorOpenOf(widget)).toEqual({ kind: "profile", source: { kind: "widget", zoneId: "z" } });
    const frames: GaugeEntry = { ...widget, source: { kind: "canvas", zoneId: "z", path: "0" }, gauge: null, name: "Sprites" };
    expect(editorOpenOf(frames)).toEqual({ kind: "profile", source: { kind: "canvas", zoneId: "z", path: "0" } });
    const id = `${"a".repeat(64)}.png`;
    const library: GaugeEntry = { ...frames, source: { kind: "library", itemId: "L" }, files: [{ id, name: "f.png" }], animationSpeed: 12 };
    expect(editorOpenOf(library)).toEqual({ kind: "frames", name: "Sprites", frames: [{ id, name: "f.png" }], animationSpeed: 12, origin: { kind: "library", itemId: "L" } });
  });

  it("starts a new gauge from the default ring", () => {
    expect(newGaugeOpen()).toMatchObject({ kind: "copy", origin: null, gauge: DEFAULT_GAUGE });
  });
});

describe("historyKey", () => {
  it("maps Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y (or Cmd)", () => {
    expect(historyKey(key("z", { ctrlKey: true }), false)).toBe("undo");
    expect(historyKey(key("Z", { ctrlKey: true, shiftKey: true }), false)).toBe("redo");
    expect(historyKey(key("y", { metaKey: true }), false)).toBe("redo");
  });

  it("ignores a plain key, Alt chords, Ctrl+Shift+Y, and anything while typing", () => {
    expect(historyKey(key("z"), false)).toBeNull();
    expect(historyKey(key("z", { ctrlKey: true, altKey: true }), false)).toBeNull();
    expect(historyKey(key("y", { ctrlKey: true, shiftKey: true }), false)).toBeNull();
    expect(historyKey(key("z", { ctrlKey: true }), true)).toBeNull();
  });
});
