import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STANDARD_DEFAULTS } from "@/modules/standard-settings";
import type { DashboardModule, ModuleSettings } from "@/modules/types";
import { fixtureSensors } from "../__fixtures__";
import { TEMPLATE_MODULES } from "../registry";
import { toFlat } from "../data-adapter";
import { adapterOf, detect, fmtRate, get, num } from "../core/data";

// The settings audit (docs/widget-settings-coverage.md): controls that did nothing are gone or fixed.
const SENSORS = fixtureSensors();
const mod = (id: string): DashboardModule => TEMPLATE_MODULES.find((m) => m.id === id)!;
const defaults = (m: DashboardModule): ModuleSettings => ({ ...STANDARD_DEFAULTS, ...Object.fromEntries((m.settings ?? []).map((d) => [d.key, d.default])) });
const markup = (id: string, over: ModuleSettings): string => renderToStaticMarkup(mod(id).render(SENSORS, { ...defaults(mod(id)), ...over }) as never);
const option = (id: string, key: string) => mod(id).settings!.find((d) => d.key === key)!.options!;

describe("Network Traffic: Session totals decides, at every tier", () => {
  it("has no View select (it only bundled Session totals and the sparkline)", () => {
    expect(mod("NetworkThroughput").settings!.some((d) => d.key === "view")).toBe(false);
  });

  it.each(["md", "lg", "sm"])("%s: on shows the totals, off hides them", (sizeTier) => {
    expect(markup("NetworkThroughput", { sizeTier, showTotals: true })).toContain("Downloaded");
    expect(markup("NetworkThroughput", { sizeTier, showTotals: false })).not.toContain("Downloaded");
  });

  it("at the small tier the totals give way to the sparkline; larger tiers show both", () => {
    expect(markup("NetworkThroughput", { sizeTier: "sm", showTotals: true, sparkline: true })).not.toContain("Downloaded");
    expect(markup("NetworkThroughput", { sizeTier: "lg", showTotals: true, sparkline: true })).toContain("Downloaded");
  });

  it("a stored legacy view is ignored", () => {
    expect(markup("NetworkThroughput", { sizeTier: "sm", showTotals: true, view: "speeds" })).toContain("Downloaded");
  });
});

describe("view presets set every switch they bundle", () => {
  it.each([
    ["Bluetooth", ["showStatus", "showDevices", "showBattery"]],
    ["Weather", ["showForecast", "showStats"]],
  ] as const)("%s: each view applies %j", (id, keys) => {
    for (const o of option(id, "view")) expect(Object.keys(o.applies ?? {}), `${id} view ${o.value}`).toEqual(expect.arrayContaining([...keys]));
  });

  it("no two Bluetooth views set the same switches", () => {
    const sets = option("Bluetooth", "view").map((o) => JSON.stringify(o.applies));
    expect(new Set(sets).size).toBe(sets.length);
  });
});

describe("CPU Monitor: Thread metric Clock", () => {
  // The fixture has cores without an effective-clock reading; one NaN used to poison every bar.
  it.each(["md", "lg"])("%s: draws no NaN bar", (sizeTier) => {
    const html = markup("CpuMonitor", { sizeTier, coreView: "bars", coreMetric: "clock" });
    expect(html).toContain("height:");
    expect(html).not.toMatch(/NaN/);
  });
});

describe("Menu Bar", () => {
  const flat = toFlat(SENSORS);
  const busiest = adapterOf(flat)!;
  const speed = (id: string) => num(get(flat, `libre.${id}_download_speed`));
  const SELECTED = "bg-[var(--accent)] text-[#0E1014]";

  it("reads Down from the busiest adapter in the chosen unit, as Network Traffic does", () => {
    const html = markup("MenuBar", { items: "down,up", rateUnit: "Mbps" });
    const [value] = fmtRate(speed(busiest), "Mbps").split(" ");
    expect(html).toContain(`${value}<small class="text-[11px] font-medium ml-0.5">Mbps</small>`);
    expect(markup("NetworkThroughput", { rateUnit: "Mbps" })).toContain(fmtRate(speed(busiest), "Mbps"));
  });

  it("uses a chosen adapter", () => {
    const other = detect(flat, /^libre\.(.+)_download_speed$/).find((a) => a !== busiest);
    if (!other) return;
    const [value] = fmtRate(speed(other), "KB/s").split(" ");
    expect(markup("MenuBar", { items: "down", rateUnit: "KB/s", device: other })).toContain(`${value}<small`);
  });

  it("shows the Active item selected without a click; none by default", () => {
    expect(markup("MenuBar", {}).split(SELECTED).length - 1).toBe(0);
    const html = markup("MenuBar", { active: "gpu" });
    expect(html.split(SELECTED).length - 1).toBe(1);
    expect(html.slice(html.indexOf(SELECTED))).toMatch(/^[^<]*"[^>]*>(?:<[^>]*>)*GPU/);
  });

  it("offers the network settings only while Down or Up is in the bar", () => {
    const def = (key: string) => mod("MenuBar").settings!.find((d) => d.key === key)!;
    for (const key of ["device", "rateUnit"]) {
      expect(def(key).visibleIf!({ items: "cpu,down" }), key).toBe(true);
      expect(def(key).visibleIf!({ items: "cpu,gpu" }), key).toBe(false);
    }
  });
});
