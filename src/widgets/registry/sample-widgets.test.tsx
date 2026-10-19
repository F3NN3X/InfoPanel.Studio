import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingRow } from "@/components/studio/setting-control";
import { widgetContext } from "@/components/studio/inspector-model";
import type { ApiSources } from "@/lib/catalog";
import { modules } from "@/modules";
import { styleSubsetSettings } from "@/modules/standard-settings";
import type { ModuleSetting, ModuleSettings, ModuleSettingValue } from "@/modules/types";
import { renderModule } from "../test-render";

const mod = (id: string) => modules.find((m) => m.id === id)!;
const def = (id: string, key: string): ModuleSetting => mod(id).settings!.find((d) => d.key === key)!;
const row = (d: ModuleSetting, value: ModuleSettingValue, extra: { bundle?: ModuleSettings; sources?: ApiSources | null } = {}) =>
  renderToStaticMarkup(createElement(SettingRow, { def: d, value, onChange: () => {}, sources: extra.sources ?? null, bundle: extra.bundle }));

describe("Weather's view is a preset row", () => {
  const view = def("Weather", "view");

  it("highlights the preset the toggles match", () => {
    const html = row(view, "now", { bundle: { showForecast: false, showStats: true, showFeels: true } });
    expect(html).toContain("Now");
    expect(html).not.toContain("Custom");
  });

  it("reads Custom once a toggle diverges", () => {
    expect(row(view, "now", { bundle: { showForecast: true, showStats: true, showFeels: false } })).toContain("Custom");
  });
});

describe("SteamProfile's source status row", () => {
  const status = def("SteamProfile", "account");
  it("names the containers the Steam plugin reports", () => {
    const sources = {
      plugins: [{ id: "InfoPanel.SteamAPI", name: "Steam API", containers: [{ id: "SteamAPI-Profile", name: "SteamAPI-Profile", entries: [] }] }],
    } as unknown as ApiSources;
    expect(row(status, "", { sources })).toContain("Connected · SteamAPI-Profile");
    expect(row(status, "", { sources: { plugins: [] } })).toContain("Not connected");
  });
});

describe("AudioMeter's hot zone is the Audio level threshold", () => {
  const ladder = (s: ModuleSettings) => renderModule(mod("AudioMeter"), { meterStyle: "led", ...s });
  it("defaults to the old 72 % / 90 % of full scale", () => {
    const d = def("AudioMeter", "warn.db");
    expect(d.default).toBeCloseTo(20 * Math.log10(0.72));
    expect(d.defaultY).toBeCloseTo(20 * Math.log10(0.9));
    expect(ladder({})).toBe(ladder({ "warn.db": d.default, "crit.db": d.defaultY! }));
  });

  it("moves with the levels, and Off never turns hot", () => {
    expect(ladder({ "warn.db": -40, "crit.db": -30 })).not.toBe(ladder({}));
    expect(ladder({ hotColor: "#ff00ff", "warn.db": "off", "crit.db": "off" })).not.toContain("#ff00ff");
    expect(ladder({ hotColor: "#ff00ff", "warn.db": -40, "crit.db": -30 })).toContain("#ff00ff");
  });
});

describe("CpuMonitor's Units & format", () => {
  it("reads its temperatures in °F with the chosen decimals", () => {
    const html = renderModule(mod("CpuMonitor"), { sizeTier: "lg", tempUnit: "f", decimals: "2" });
    expect(html).toContain("°F");
    expect(html).not.toContain("°C");
    expect(html).toMatch(/\d+\.\d{2} °F/);
  });
});

describe("WebPage's look subset", () => {
  it("offers the declared subset and notes it", () => {
    const keys = styleSubsetSettings(["colors:accent", "spacing:scale,radius", "border"]).map((d) => d.key);
    expect(keys.sort()).toEqual(["accent", "borderColor", "borderWidth", "glow", "glowColor", "radius", "scale"]);
    expect(mod("WebPage").settings!.map((d) => d.key).sort()).toEqual([...keys, "url"].sort());
    expect(widgetContext(mod("WebPage"))).toMatchObject({ reducedStyle: true, noData: true });
  });
});
