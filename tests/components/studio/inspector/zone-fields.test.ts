import { describe, expect, it } from "vitest";
import type { Placement } from "@/lib/layout";
import { resolveStyle } from "@/lib/style-resolve";
import { registerSampleCards } from "@/looks/sample-materials";
import type { ModuleSetting } from "@/modules/types";
import {
  customised,
  shownValue,
  withFollow,
  withKnob,
  withKnobReset,
  withoutOwnLookCard,
  withSettings,
  zoneLookValues,
} from "@/components/studio/inspector/zone-fields";

const zone = (patch: Partial<Placement>): Placement => ({
  id: "z",
  module: "SystemOverview",
  colStart: 1,
  rowStart: 1,
  colSpan: 2,
  rowSpan: 1,
  visible: true,
  ...patch,
});

const accent: ModuleSetting = { key: "accent", label: "Accent", type: "color", default: "" };

describe("withFollow", () => {
  it("Customize and Use theme flip one section and keep the own values (SPEC §9: they come back)", () => {
    const own = zone({ settings: { accent: "#ff0000" } });
    const custom = withFollow(own, "colors", false);
    expect(custom.follow).toEqual({ colors: false });
    const back = withFollow(custom, "colors", true);
    expect(back.follow).toBeUndefined();
    expect(back.settings).toEqual({ accent: "#ff0000" });
    expect(shownValue(zoneLookValues(withFollow(back, "colors", false), {}), "accent", accent)).toBe("#ff0000");
  });
});

describe("customised", () => {
  const glow: ModuleSetting = { key: "glow", label: "Edge glow", type: "select", default: "none" };
  const label: ModuleSetting = { key: "label", label: "Title", type: "text", default: "", perWidget: true };
  const defs = [accent, glow, label];

  it("turns each following section an edited key belongs to custom", () => {
    const edited = customised(zone({}), {}, defs, ["accent", "glow"]);
    expect(edited.follow).toEqual({ colors: false, border: false });
  });

  it("leaves a custom section, a per-widget key and an unknown key alone", () => {
    const own = zone({ follow: { colors: false } });
    expect(customised(own, {}, defs, ["accent"])).toBe(own);
    const plain = zone({});
    expect(customised(plain, {}, defs, ["label", "nope"])).toEqual(plain);
  });

  it("leaves a section the screen locks alone", () => {
    const plain = zone({});
    expect(customised(plain, { profile: { locks: { colors: true } } }, defs, ["accent"])).toBe(plain);
  });
});

describe("withKnobReset (a knob's Reset on a widget, L46)", () => {
  const text: ModuleSetting = { key: "textColor", label: "Text", type: "color", default: "" };
  const defs = [accent, text];
  const levels = { profile: { values: { accent: "#00ff00", textColor: "#ffffff" } } };

  it("clears the knob's keys and follows the page again when nothing else of its own differs there", () => {
    const own = zone({ settings: { accent: "#ff0000", textColor: "#ffffff" }, follow: { colors: false } });
    const out = withKnobReset(own, levels, defs, ["accent"]);
    expect(out.settings).toEqual({ textColor: "#ffffff" });
    expect(out.follow).toBeUndefined();
  });

  it("keeps the section custom while another own value differs from the page's", () => {
    const own = zone({ settings: { accent: "#ff0000", textColor: "#000000" }, follow: { colors: false } });
    expect(withKnobReset(own, levels, defs, ["accent"]).follow).toEqual({ colors: false });
  });
});

describe("withKnob (a knob edit on a widget detaches that knob only, L46)", () => {
  const pad: ModuleSetting = { key: "padding", label: "Padding", type: "number", default: "auto" };
  const radius: ModuleSetting = { key: "radius", label: "Corners", type: "number", default: "auto" };
  const text: ModuleSetting = { key: "textColor", label: "Text", type: "color", default: "" };
  const defs = [accent, text, pad, radius];
  const levels = { profile: { values: { padding: "8", textColor: "#ffffff" } } };

  it("drops the stored values a following section held, so the rest of it still shows the page's", () => {
    // Padding was set once, then the section followed the page again: its value stayed stored, inactive.
    const own = zone({ settings: { padding: "20", textColor: "#000000" } });
    const out = withKnob(own, levels, defs, { radius: "12" });
    expect(out.settings).toEqual({ textColor: "#000000", radius: "12" });
    expect(out.follow).toEqual({ spacing: false });
    expect(shownValue(zoneLookValues(out, levels), "padding", pad)).toBe("8");
    // Colors still follows: its stored text colour stays as it was.
    expect(shownValue(zoneLookValues(out, levels), "textColor", text)).toBe("#ffffff");
  });

  it("keeps the other values of a section that is already the widget's own", () => {
    const own = zone({ settings: { padding: "20" }, follow: { spacing: false } });
    expect(withKnob(own, levels, defs, { radius: "12" }).settings).toEqual({ padding: "20", radius: "12" });
  });

  it("leaves a section the screen locks alone", () => {
    const own = zone({ settings: { padding: "20" } });
    const locked = { profile: { ...levels.profile, locks: { spacing: true } } };
    const out = withKnob(own, locked, defs, { radius: "12" });
    expect(out.settings).toEqual({ padding: "20", radius: "12" });
    expect(out.follow).toBeUndefined();
  });

  it("then Reset follows the page again", () => {
    const out = withKnob(zone({ settings: { padding: "20" } }), levels, defs, { radius: "12" });
    const back = withKnobReset(out, levels, defs, ["radius"]);
    expect(back.settings).toBeUndefined();
    expect(back.follow).toBeUndefined();
  });
});

describe("a widget's own Look's card (L49)", () => {
  const surface: ModuleSetting = { key: "surface", label: "Surface", type: "select", default: "glass" };
  const skin: ModuleSetting = { key: "lookId", label: "Look", type: "select", default: "" };
  const defs = [surface, skin];
  // A widget that wears Term on a Classic screen.
  const termWidget = zone({ settings: { lookId: "term" }, follow: { skin: false } });

  it("is left to the Look: picking it stores none, and the widget still draws it", () => {
    registerSampleCards();
    const out = withKnob(termWidget, {}, defs, { surface: "look-term" });
    expect(out.settings).toEqual({ lookId: "term" });
    expect(resolveStyle({ levels: {}, own: out.settings, follow: out.follow }).settings.surface).toBe("look-term");
  });

  it("stays stored where the widget would not draw it without (the screen stores another card)", () => {
    registerSampleCards();
    const levels = { profile: { values: { surface: "glass" } } };
    expect(withKnob(termWidget, levels, defs, { surface: "look-term" }).settings).toEqual({ lookId: "term", surface: "look-term" });
  });

  it("keeps any other card", () => {
    registerSampleCards();
    expect(withoutOwnLookCard(withSettings(termWidget, { surface: "look-paper" }), {}).settings?.surface).toBe("look-paper");
    expect(withoutOwnLookCard(withSettings(termWidget, { surface: "matte-dark" }), {}).settings?.surface).toBe("matte-dark");
  });
});
