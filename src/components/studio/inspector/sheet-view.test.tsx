import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ModuleSetting } from "@/modules/types";
import type { InspectorSection } from "../inspector-model";
import { InspectorChromeProvider, type SheetChrome } from "../inspector-layout";
import type { FieldsApi } from "../settings-panel";
import { SheetView, type SheetIdentity } from "./sheet-view";

const def = (key: string, label: string): ModuleSetting => ({ key, label, type: "boolean", default: false }) as ModuleSetting;

const section = (id: string, title: string, settings: ModuleSetting[]): InspectorSection => ({
  id,
  title,
  tab: "show",
  general: false,
  settings,
  extras: [],
  terms: [],
});

const sections = [
  section("look", "Look", [def("glow", "Glow"), { ...def("halo", "Halo"), more: true }]),
  section("colors", "Colors & surface", [def("tint", "Tint")]),
];

const fields = {
  values: { tint: true },
  shown: (key: string) => key === "tint",
  onChange: () => {},
  onClear: () => {},
} as unknown as FieldsApi;

const identity: SheetIdentity = { icon: <span />, name: "Weather", meta: (n) => `Weather · ${n} changed` };

function render(sheet: Partial<SheetChrome>, extra: Partial<SheetIdentity> = {}, quickKeys: string[] = ["tint"]) {
  const chrome: SheetChrome = { snap: "peek", setSnap: () => {}, tool: "quick", setTool: () => {}, ...sheet };
  return renderToString(
    <InspectorChromeProvider value={{ mode: "sheet", sheet: chrome }}>
      <SheetView
        sheet={chrome}
        identity={{ ...identity, ...extra }}
        sections={sections}
        parts={() => ({})}
        changedOf={(s) => (s.id === "colors" ? 1 : 0)}
        changed={1}
        fields={fields}
        sources={null}
        quickKeys={quickKeys}
        moreScope="Weather"
      />
    </InspectorChromeProvider>
  );
}

describe("SheetView", () => {
  it("peeks with the header and a tile per section after Quick, no fields", () => {
    const out = render({});
    expect(out).toContain("Weather · 1 changed");
    expect(out).toContain('aria-label="All settings"');
    expect(out).toContain('aria-label="Setting groups"');
    expect(out.indexOf(">Quick<")).toBeLessThan(out.indexOf(">Look<"));
    // The short label of "Colors & surface".
    expect(out).toContain(">Colors<");
    expect(out).not.toContain("data-setting-key");
  });

  it("at half shows the Quick tool's pinned fields", () => {
    const out = render({ snap: "half" });
    expect(out).toContain('data-setting-key="tint"');
    expect(out).not.toContain('data-setting-key="glow"');
  });

  it("at half shows the chosen section's fields, and falls back to Quick when the zone lacks it", () => {
    expect(render({ snap: "half", tool: "look" })).toContain('data-setting-key="glow"');
    expect(render({ snap: "half", tool: "missing" })).toContain('data-setting-key="tint"');
  });

  it("keeps a section's More rows behind its More (n) link", () => {
    const out = render({ snap: "half", tool: "look" });
    expect(out).toContain("More (1)");
    expect(out).not.toContain('data-setting-key="halo"');
  });

  it("says what to pin when the Quick set is empty", () => {
    expect(render({ snap: "half" }, {}, [])).toContain("Pin settings from the panel to show them here");
  });

  it("with nothing selected the peek only asks for a tap", () => {
    const out = render({}, { peekNote: "Tap a widget to edit it." });
    expect(out).toContain("Tap a widget to edit it.");
    expect(out).not.toContain('aria-label="Setting groups"');
  });

  it("offers the eye only when the context can hide", () => {
    expect(render({})).not.toContain('aria-label="Hide"');
    expect(render({}, { onToggleVisible: () => {}, hidden: true })).toContain('aria-label="Show"');
  });
});
