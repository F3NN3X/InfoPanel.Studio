import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isClaimed, modules } from "@/modules";
import { STANDARD_SETTINGS } from "@/modules/standard-settings";
import { effectiveSettings, type ModuleSetting, type ModuleSettings } from "@/modules/types";
import type { ShellProps, WidgetMeta } from "@/widgets/core/types";
import { shellProps, templateModule, withSkinSurface } from "@/widgets/module";
import { fixtureSensors } from "@/widgets/__fixtures__";
import { TEMPLATE_MODULES } from "@/widgets/registry";

const meta: WidgetMeta = {
  id: "demo",
  name: "Demo",
  category: "System",
  icon: "memory",
  prefixes: ["demo."],
  defaultSize: [4, 3],
  minSize: [3, 2],
  description: "A demo template",
};
const own: ModuleSetting = { key: "unit", label: "Unit", type: "text", default: "x" };

type DemoProps = ShellProps & { look?: ModuleSettings; unit?: string };
const calls: DemoProps[] = [];
const seen = () => calls[calls.length - 1];
const Demo = (p: DemoProps) => {
  calls.push(p);
  return null;
};
const build = () =>
  templateModule({ meta, Component: Demo, settings: [own], toProps: (s) => ({ unit: String(s.unit) }), prefixes: ["extra."] });

describe("templateModule", () => {
  const mod = build();

  it("maps the meta onto the module", () => {
    expect(mod).toMatchObject({
      id: "demo",
      title: "Demo",
      minCols: 3,
      minRows: 2,
      prefixes: ["demo."],
      reads: ["extra."],
      category: "System",
      icon: "memory",
      description: "A demo template",
      defaultSize: [4, 3],
    });
    expect(templateModule({ meta, Component: Demo, settings: [], toProps: () => ({}), title: "Other" }).title).toBe("Other");
  });

  it("puts the standard block before the template's own settings", () => {
    expect(mod.settings).toEqual([...STANDARD_SETTINGS, own]);
  });

  it("renders the component with flat data, the shell props and its own props", () => {
    const saved = { skin: "tui", label: "Hi", unit: "y", compact: "full", radius: "12" };
    renderToStaticMarkup(mod.render({ "demo.a": { value: 5, unit: "W" } }, saved) as never);
    expect(seen().data).toEqual({ "demo.a": "5 W" });
    expect(seen()).toMatchObject({ skin: "tui", title: "Hi", unit: "y", compactView: "off", variant: "default", radius: 12 });
    expect(seen().look).toEqual({ ...effectiveSettings(mod, saved), surface: "tui" });
  });

  it("falls back to the defaults when nothing is saved", () => {
    renderToStaticMarkup(mod.render({ "demo.a": { value: 5, unit: "W" } }) as never);
    expect(seen()).toMatchObject({ unit: "x", skin: undefined, graph: undefined, meter: undefined, title: undefined });
  });
});

describe("templateModule settings block", () => {
  it("keeps the standard block + own settings by default, or the block given as `base`", () => {
    expect(templateModule({ meta, Component: Demo, settings: [own], toProps: () => ({}) }).settings).toEqual([...STANDARD_SETTINGS, own]);
    expect(templateModule({ meta, Component: Demo, base: [], settings: [own], toProps: () => ({}) }).settings).toEqual([own]);
  });

  it("takes the surface default from the settings block", () => {
    const surface: ModuleSetting = { key: "surface", label: "Surface", type: "select", default: "theme" };
    renderToStaticMarkup(templateModule({ meta, Component: Demo, base: [surface], settings: [own], toProps: () => ({}) }).render({ "demo.a": { value: 1, unit: "" } }) as never);
    expect(seen().look?.surface).toBe("theme");
  });
});

describe("templateModule with no data", () => {
  it("renders nothing until a key under its prefixes or reads exists", () => {
    const mod = build();
    expect(mod.render({})).toBeNull();
    expect(mod.render({ "other.a": { value: 1, unit: "" } })).toBeNull();
    expect(mod.render({ "demo.a": { value: 1, unit: "" } })).not.toBeNull();
    expect(mod.render({ "extra.a": { value: 1, unit: "" } })).not.toBeNull();
  });

  it("reads any key when the module has no prefixes, and always renders the sensorless ids", () => {
    const open = templateModule({ meta: { ...meta, prefixes: [] }, Component: Demo, settings: [], toProps: () => ({}) });
    expect(open.render({})).toBeNull();
    expect(open.render({ "any.key": { value: 1, unit: "" } })).not.toBeNull();
    const clock = templateModule({ meta: { ...meta, id: "Clock" }, Component: Demo, settings: [], toProps: () => ({}) });
    expect(clock.render({})).not.toBeNull();
  });
});

describe("shellProps", () => {
  it("turns auto and empty into undefined", () => {
    expect(
      shellProps({ accent: "", surface: "auto", radius: "auto", skin: "auto", compact: "auto", graph: "auto", meter: "auto", label: "" })
    ).toEqual({
      accent: undefined,
      surface: undefined,
      radius: undefined,
      skin: undefined,
      variant: undefined,
      graph: undefined,
      meter: undefined,
      compactView: undefined,
      title: undefined,
    });
  });

  it("passes chosen values through", () => {
    expect(
      shellProps({ accent: "#fff", surface: "glass", radius: "999", skin: "ink", compact: "dense", graph: "braille", meter: "wave", label: "CPU" })
    ).toEqual({
      accent: "#fff",
      surface: "glass",
      radius: 999,
      skin: "ink",
      variant: "studio",
      graph: "braille",
      meter: "wave",
      compactView: undefined,
      title: "CPU",
    });
  });

  it("maps Small zones onto the shell: card = the summary card always, full = never, dense = the studio view", () => {
    expect(shellProps({ compact: "card" })).toMatchObject({ compactView: "on", variant: undefined });
    expect(shellProps({ compact: "full" })).toMatchObject({ compactView: "off", variant: "default" });
    expect(shellProps({ compact: "dense" })).toMatchObject({ compactView: undefined, variant: "studio" });
  });

  it("still reads the old variant / compactView while Small zones is Auto (until PR 8)", () => {
    expect(shellProps({ compact: "auto", compactView: "on" }).compactView).toBe("on");
    expect(shellProps({ compactView: "off", variant: "studio" }).variant).toBe("studio");
  });
});

describe("Summary card", () => {
  const power = TEMPLATE_MODULES.find((m) => m.id === "PowerDraw")!;
  const view = (s: ModuleSettings) => /data-wp-view="(\w+)"/.exec(renderToStaticMarkup(power.render(fixtureSensors(), s) as never))?.[1];

  it("Always shows the summary card where Auto shows the full layout", () => {
    expect(view({})).toBe("body");
    expect(view({ compact: "card" })).toBe("compact");
  });

  it("Dense shows the studio view", () => {
    expect(view({ compact: "dense" })).toBe("studio");
  });
});

describe("registry", () => {
  it("is the template modules", () => {
    expect(modules).toEqual(TEMPLATE_MODULES);
  });

  it("keeps the covered plugins' keys out of the catch-all, and only those", () => {
    for (const key of ["system.cpu.load", "libre.cpu_load", "plugins.spotify-plugin.spotify.title", "plugins.InfoPanel.StreamDeck.x"]) expect(isClaimed(key), key).toBe(true);
    // the template-only sources (Clock, Weather's OpenWeatherMap, the volume plugin) stay unclaimed
    for (const key of ["plugins.clock-plugin.time", "plugins.weather-plugin.temp", "plugins.volume-plugin.volume", "nothing.claims.this"]) expect(isClaimed(key), key).toBe(false);
  });
});

describe("withSkinSurface", () => {
  const look = (o: ModuleSettings): ModuleSettings => ({ surface: "glass", skin: "auto", ...o });
  it("keeps glass for skin auto and brings the skin's surface otherwise", () => {
    expect(withSkinSurface(look({}), {}).surface).toBe("glass");
    expect(withSkinSurface(look({ skin: "ink" }), undefined).surface).toBe("outline");
    expect(withSkinSurface(look({ skin: "default" }), {}).surface).toBe("glass");
  });
  it("lets a surface set at any level win", () => {
    expect(withSkinSurface(look({ skin: "ink", surface: "theme" }), { surface: "theme" }).surface).toBe("theme");
  });
});
