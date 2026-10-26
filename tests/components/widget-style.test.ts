import { describe, expect, it } from "vitest";
import {
  byShape,
  chromeVars,
  fadeColors,
  flow,
  MAX_AUTO_ZOOM,
  MIN_AUTO_ZOOM,
  scopedCss,
  strokeOf,
  surfaceBox,
  tokenScope,
  ws,
  zoomFor,
} from "@/components/widget-style";
import {
  chromeOf,
  PROFILE_STYLE_KEYS,
  replaceStyle,
  STANDARD_DEFAULTS,
  styleOf,
} from "@/modules/standard-settings";
import { withProfileStyle } from "@/modules/types";
import { DESIGN_SIZE } from "@/widgets/core/layout";

const DESIGN = { w: 400, h: 200 };

describe("zoomFor", () => {
  it("fits the zone to the design size on the tighter axis", () => {
    expect(zoomFor({ w: 800, h: 300 }, DESIGN, { autoScale: true })).toBe(1.5);
    expect(zoomFor({ w: 400, h: 200 }, DESIGN, {})).toBe(1);
  });

  it("clamps auto-scale and applies the user's size on top", () => {
    expect(zoomFor({ w: 100, h: 50 }, DESIGN, {})).toBe(MIN_AUTO_ZOOM);
    expect(zoomFor({ w: 9000, h: 9000 }, DESIGN, {})).toBe(MAX_AUTO_ZOOM);
    expect(zoomFor({ w: 9000, h: 9000 }, DESIGN, { scale: 0.5 })).toBe(MAX_AUTO_ZOOM * 0.5);
  });

  it("uses only the user's size without a design size, a measurement or auto-scale", () => {
    expect(zoomFor({ w: 800, h: 400 }, undefined, { scale: 1.25 })).toBe(1.25);
    expect(zoomFor({ w: 0, h: 0 }, DESIGN, { scale: 1.25 })).toBe(1.25);
    expect(zoomFor({ w: 800, h: 400 }, DESIGN, { autoScale: false, scale: 1.25 })).toBe(1.25);
    expect(zoomFor({ w: 800, h: 400 }, DESIGN, undefined)).toBe(2);
  });

  it("grows a widget past the shell's design size, up to 2.5×, with Size % on top", () => {
    // the lg tier's smallest box: no zoom there, and none below it
    expect(zoomFor({ w: 500, h: 320 }, DESIGN_SIZE, undefined)).toBe(1);
    expect(zoomFor({ w: 300, h: 200 }, DESIGN_SIZE, undefined)).toBe(1);
    // twice the design on the tighter side
    expect(zoomFor({ w: 1400, h: 640 }, DESIGN_SIZE, undefined)).toBe(2);
    expect(zoomFor({ w: 1920, h: 1080 }, DESIGN_SIZE, undefined)).toBe(2.5);
    expect(zoomFor({ w: 1920, h: 1080 }, DESIGN_SIZE, { scale: 0.8 })).toBe(2);
    // a Size % that already fills the zone keeps its own zoom: the auto part only fills the room it leaves
    expect(zoomFor({ w: 950, h: 500 }, DESIGN_SIZE, { scale: 1.6 })).toBe(1.6);
    expect(zoomFor({ w: 1500, h: 1000 }, DESIGN_SIZE, { scale: 1.5 })).toBe(3);
  });

  it("picks the design size from the zone's shape", () => {
    const shape = byShape({ wide: { w: 500, h: 200 }, tall: { w: 200, h: 500 }, square: { w: 300, h: 300 } });
    expect(shape(1000, 400)).toEqual({ w: 500, h: 200 });
    expect(shape(400, 1000)).toEqual({ w: 200, h: 500 });
    expect(shape(500, 450)).toEqual({ w: 300, h: 300 });
    expect(zoomFor({ w: 1000, h: 400 }, shape, {})).toBe(2);
  });
});

describe("chromeVars", () => {
  it("writes nothing for the defaults", () => {
    expect(chromeVars(undefined)).toBeUndefined();
    expect(chromeVars(chromeOf(STANDARD_DEFAULTS))).toBeUndefined();
  });

  it("writes a variable per chosen option", () => {
    const vars = chromeVars({
      accent: "#f00",
      padding: 8,
      gap: 0,
      radius: 999,
      textColor: "#fff",
      mutedColor: "#aaa",
      fontWeight: "500",
      labelCase: "none",
      alignX: "between",
      alignY: "end",
      font: "mono",
    }) as Record<string, string>;
    expect(vars).toMatchObject({
      "--wp-accent": "#f00",
      "--wp-pad": "8px",
      "--wp-gap": "0px",
      "--wp-radius": "999px",
      "--wp-fg": "#fff",
      "--wp-muted": "#aaa",
      "--wp-weight": "500",
      "--wp-label-case": "none",
      "--wp-x": "space-between",
      "--wp-x-cross": "stretch",
      "--wp-text-align": "left",
      "--wp-flex": "0 1 auto",
      "--wp-y": "safe flex-end",
      "--wp-y-cross": "safe flex-end",
    });
    expect(chromeVars({ alignX: "center" })).toMatchObject({
      "--wp-x": "safe center",
      "--wp-x-cross": "safe center",
    });
    expect(vars.fontFamily).toContain("monospace");
  });
});

describe("tokenScope", () => {
  it("re-scopes the theme tokens to the hex colors", () => {
    expect(tokenScope(undefined)).toEqual({});
    expect(tokenScope({ accent: "", textColor: "red" })).toEqual({});
    expect(tokenScope({ accent: "#ffffff", textColor: "#000000", mutedColor: "#ff0000" })).toEqual({
      "--accent": "0 0% 100%",
      "--foreground": "0 0% 0%",
      "--card-foreground": "0 0% 0%",
      "--muted-foreground": "0 100% 50%",
    });
  });

  it("is part of the widget root's variables", () => {
    expect(chromeVars({ accent: "#ff0000", textColor: "#00ff00" })).toMatchObject({
      "--wp-accent": "#ff0000",
      "--accent": "0 100% 50%",
      "--wp-fg": "#00ff00",
      "--foreground": "120 100% 50%",
    });
  });
});

describe("helpers", () => {
  it("fall back to the widget's own values", () => {
    expect(ws.pad(20)).toBe("var(--wp-pad, 20px)");
    expect(ws.radius("50%")).toBe("var(--wp-radius, 50%)");
    expect(ws.weight(700)).toBe("var(--wp-weight, 700)");
    expect(ws.flex()).toBe("var(--wp-flex, 1 1 0)");
  });

  it("map alignment to the right flex axis", () => {
    expect(flow("row", { x: "between", y: "center" })).toEqual({
      flexDirection: "row",
      justifyContent: "var(--wp-x, space-between)",
      alignItems: "var(--wp-y-cross, center)",
    });
    expect(flow("column", { x: "start", y: "end" })).toEqual({
      flexDirection: "column",
      justifyContent: "var(--wp-y, flex-end)",
      alignItems: "var(--wp-x-cross, flex-start)",
    });
  });

  it("scale strokes by the thickness option", () => {
    expect(strokeOf({ stroke: 2 }, 6)).toBe(12);
    expect(strokeOf(undefined, 6)).toBe(6);
  });
});

describe("chromeOf", () => {
  it("parses the saved settings, rejecting unknown values", () => {
    const c = chromeOf({
      scale: 150,
      padding: "12",
      gap: "auto",
      radius: "999",
      align: "sideways",
      fontWeight: "700",
      stroke: 50,
    });
    expect(c).toMatchObject({
      scale: 1.5,
      padding: 12,
      gap: undefined,
      radius: 999,
      alignX: "auto",
      alignY: "auto",
      fontWeight: "700",
      stroke: 0.5,
    });
  });

  it("reads the alignment's cell code and spread as the two axes", () => {
    expect(chromeOf({ align: "bl" })).toMatchObject({ alignX: "start", alignY: "end" });
    expect(chromeOf({ align: "tc", alignSpread: true })).toMatchObject({ alignX: "between", alignY: "start" });
    expect(chromeOf({ align: "auto", alignSpread: true })).toMatchObject({ alignX: "between", alignY: "auto" });
  });

  it("defaults a module without the style block to no change (no scale with the zone any more)", () => {
    expect(chromeOf({})).toMatchObject({ scale: 1, stroke: 1, padding: undefined });
    expect(chromeOf({ autoScale: false })).not.toHaveProperty("autoScale");
  });

  it("parses the surface options, allowing a fully transparent surface", () => {
    expect(chromeOf(STANDARD_DEFAULTS)).toMatchObject({
      borderWidth: undefined,
      glow: "none",
      surfaceOpacity: 1,
      blur: undefined,
      customCss: "",
    });
    expect(chromeOf({ surfaceOpacity: 0, borderWidth: "2", blur: "16", glow: "loud" })).toMatchObject({
      surfaceOpacity: 0,
      borderWidth: 2,
      blur: 16,
      glow: "none",
    });
  });
});

describe("surfaceBox", () => {
  const sv = { background: "rgba(24, 24, 27, 0.8)", fg: "#fff", ring: "rgba(255, 255, 255, 0.1)" };

  it("is the widget's own box with the defaults", () => {
    expect(surfaceBox(sv, chromeOf(STANDARD_DEFAULTS))).toEqual({
      background: sv.background,
      color: "#fff",
      boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.1)",
    });
  });

  it("applies border, glow, opacity and blur", () => {
    const box = surfaceBox(sv, {
      borderWidth: 3,
      borderColor: "#f0f",
      glow: "strong",
      accent: "#0ff",
      surfaceOpacity: 0.5,
      blur: 8,
    });
    expect(box).toMatchObject({
      background: "rgba(24, 24, 27, 0.4)",
      boxShadow: "inset 0 0 0 3px #f0f, inset 0 0 32px #0ff",
      backdropFilter: "blur(min(8px, var(--wp-blur-cap, 8px)))",
    });
  });
});

describe("fadeColors", () => {
  it("fades every color of a gradient", () => {
    expect(
      fadeColors("linear-gradient(155deg, rgba(24, 24, 27, 0.85) 0%, rgb(1, 2, 3) 100%)", 0.5)
    ).toBe("linear-gradient(155deg, rgba(24, 24, 27, 0.43) 0%, rgba(1, 2, 3, 0.5) 100%)");
    expect(fadeColors("#ff0000", 0.25)).toBe("rgba(255, 0, 0, 0.25)");
    expect(fadeColors("#abc", 0)).toBe("rgba(170, 187, 204, 0)");
  });

  it("fades theme token colors", () => {
    expect(fadeColors("hsl(var(--card))", 0.5)).toBe("hsl(var(--card) / 0.5)");
    expect(fadeColors("hsl(var(--card) / 0.85)", 0.5)).toBe("hsl(var(--card) / 0.43)");
    expect(fadeColors("linear-gradient(hsl(var(--a)/0.4), #000)", 0.5)).toBe(
      "linear-gradient(hsl(var(--a) / 0.2), rgba(0, 0, 0, 0.5))"
    );
  });
});

describe("scopedCss", () => {
  it("wraps the rules in an @scope for the widget root", () => {
    expect(scopedCss(":r1:", ":scope { opacity: .5 }")).toBe(
      '@scope ([data-wp-scope=":r1:"]) {\n:scope { opacity: .5 }\n}'
    );
    expect(scopedCss("x", "   ")).toBe("");
  });
});

describe("profile style", () => {
  it("covers only look keys", () => {
    for (const key of ["accent", "surface", "radius", "glow", "customCss"])
      expect(PROFILE_STYLE_KEYS.has(key)).toBe(true);
    for (const key of ["label", "layout", "icon", "background", "preset", "hideWhenIdle"])
      expect(PROFILE_STYLE_KEYS.has(key)).toBe(false);
    expect(styleOf({ radius: "8", label: "CPU" })).toEqual({ radius: "8" });
  });

  it("lets the widget's own value win over the profile's", () => {
    expect(withProfileStyle({ radius: "4" }, { radius: "16", font: "mono" })).toEqual({
      radius: "4",
      font: "mono",
    });
    expect(withProfileStyle(undefined, undefined)).toBeUndefined();
    expect(withProfileStyle({ a: 1 }, {})).toEqual({ a: 1 });
  });

  it("replaces a widget's style wholesale, keeping content and skipping unsupported keys", () => {
    const supported = new Set(["radius", "font", "label"]);
    expect(
      replaceStyle({ label: "GPU", radius: "4", gap: "8" }, { font: "mono", glow: "soft", label: "x" }, supported)
    ).toEqual({ label: "GPU", font: "mono" });
    expect(replaceStyle({ radius: "4" }, {}, supported)).toBeUndefined();
  });
});
