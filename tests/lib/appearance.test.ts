import { describe, expect, it } from "vitest";
import {
  backgroundKey,
  backgroundLayers,
  color,
  cssUrl,
  mediaUrl,
  normalizeBackground,
  resolveBackground,
  withBackground,
  withBackgroundType,
  type PageBackground,
} from "@/lib/appearance";
import { mergeConfig, type DashboardConfig } from "@/lib/layout";

describe("resolveBackground", () => {
  const dash: PageBackground = { type: "color", color: "#112233" };
  const own: PageBackground = { type: "gradient", gradient: { from: "#000", to: "#fff", angle: 90 } };

  it("uses the profile's own background over the dashboard's", () => {
    expect(resolveBackground({ background: dash }, { background: own })).toBe(own);
  });

  it("inherits the dashboard's when the profile sets none", () => {
    expect(resolveBackground({ background: dash }, {})).toBe(dash);
  });

  it("treats an explicit none on the profile as no background", () => {
    expect(resolveBackground({ background: dash }, { background: { type: "none" } })).toBeUndefined();
  });

  it("is undefined when nothing is set or the dashboard is none", () => {
    expect(resolveBackground({}, {})).toBeUndefined();
    expect(resolveBackground({ background: { type: "none", color: "#fff" } }, {})).toBeUndefined();
  });

  it("lets a profile show one while the dashboard is none", () => {
    expect(resolveBackground({ background: { type: "none" } }, { background: dash })).toBe(dash);
  });

  it("shows only the fill (or nothing) for an image or video with no file yet", () => {
    expect(resolveBackground({ background: { type: "image" } }, {})).toBeUndefined();
    expect(resolveBackground({ background: { type: "video", color: "#123" } }, {})).toEqual({
      type: "color",
      color: "#123",
    });
  });
});

describe("backgroundLayers", () => {
  it("fills a color background with no media or overlay", () => {
    expect(backgroundLayers({ type: "color", color: "#123456", dim: 50 })).toEqual({
      fill: { backgroundColor: "#123456" },
      media: null,
      overlay: null,
    });
  });

  it("draws a gradient at its angle, without a fill", () => {
    const l = backgroundLayers({ type: "gradient", gradient: { from: "#111", to: "#eee", angle: 45 } });
    expect(l.fill).toEqual({});
    expect(l.media).toEqual({ backgroundImage: "linear-gradient(45deg, #111, #eee)" });
  });

  it("escapes quotes in the image URL", () => {
    expect(cssUrl('/a"b\\c.png')).toBe('url("/a\\"b\\\\c.png")');
  });
});

describe("normalizeBackground", () => {
  it("drops non-objects and unknown types", () => {
    for (const bad of [undefined, null, "image", 3, [], {}, { type: "pattern" }]) {
      expect(normalizeBackground(bad)).toBeUndefined();
    }
  });

  it("keeps a valid background as it is", () => {
    const bg: PageBackground = {
      type: "image",
      src: "https://example.com/a.jpg",
      fit: "tile",
      position: { x: "end", y: "start" },
      dim: 30,
      tint: "#336699",
      tintOpacity: 25,
      blur: 6,
      color: "#000",
      gradient: { from: "#111", to: "#222", angle: 10 },
    };
    expect(normalizeBackground(bg)).toEqual(bg);
    expect(normalizeBackground({ type: "none" })).toEqual({ type: "none" });
  });

  it("clamps numbers and drops invalid fields", () => {
    expect(
      normalizeBackground({
        type: "image",
        src: "javascript:alert(1)",
        poster: 5,
        fit: "zoom",
        dim: 250,
        tintOpacity: -4,
        blur: 999,
        rate: 100,
        color: "red; background: url(x)",
        tint: "",
        loop: "yes",
        position: { x: "left" },
        gradient: { from: "#000" },
      })
    ).toEqual({ type: "image", dim: 100, tintOpacity: 0, blur: 40, rate: 4 });
  });

  it("wraps the gradient angle and fills a missing one", () => {
    expect(normalizeBackground({ type: "gradient", gradient: { from: "#0", to: "#1", angle: -90 } })?.gradient?.angle).toBe(270);
    expect(normalizeBackground({ type: "gradient", gradient: { from: "#0", to: "#1" } })?.gradient?.angle).toBe(160);
  });

  it("completes a half-set position", () => {
    expect(normalizeBackground({ type: "image", position: { y: "end" } })?.position).toEqual({ x: "center", y: "end" });
  });
});

describe("mediaUrl", () => {
  it("accepts http(s), paths and data images; refuses other schemes", () => {
    expect(mediaUrl(" /api/assets/abc ")).toBe("/api/assets/abc");
    expect(mediaUrl("http://127.0.0.1:3922/x.png")).toBe("http://127.0.0.1:3922/x.png");
    expect(mediaUrl("data:image/png;base64,AAA")).toBe("data:image/png;base64,AAA");
    expect(mediaUrl("data:text/html,<b>")).toBeUndefined();
    expect(mediaUrl("file:///C:/x.png")).toBeUndefined();
    expect(mediaUrl("/a\nb")).toBeUndefined();
    expect(mediaUrl("")).toBeUndefined();
  });

  it("refuses protocol-relative URLs that would load from another host", () => {
    expect(mediaUrl("//evil.example/x.png")).toBeUndefined();
    expect(mediaUrl("/\\evil.example/x.png")).toBeUndefined();
    expect(mediaUrl("\\\\evil.example\\x.png")).toBeUndefined();
  });
});

describe("color", () => {
  it("accepts hex, names and color functions", () => {
    for (const c of ["#abc", "#11223344", "teal", "rgb(1, 2, 3)", "hsl(220 15% 10% / .5)", "color-mix(in srgb, red 40%, transparent)", "var(--accent)"])
      expect(color(c)).toBe(c);
  });

  it("refuses values that could fetch or break out of the CSS value", () => {
    for (const c of ["red), url(//evil.example/x", "url(//evil.example)", "image-set('x')", "red; top: 0", "red\"", ""])
      expect(color(c)).toBeUndefined();
  });

  it("drops a bad tint or gradient color from a stored background", () => {
    expect(normalizeBackground({ type: "color", color: "url(//evil)", tint: "red),url(//x" })).toEqual({ type: "color" });
  });
});

describe("withBackground", () => {
  const config = (): DashboardConfig =>
    mergeConfig({
      profiles: [
        { id: "a", name: "A", width: 800, height: 480, cols: 4, rows: 2, fit: "fill", placements: [] },
        { id: "b", name: "B", width: 800, height: 480, cols: 4, rows: 2, fit: "fill", placements: [] },
      ],
    });
  const bg: PageBackground = { type: "color", color: "#abcdef" };

  it("sets the dashboard background for all profiles", () => {
    const next = withBackground(config(), { kind: "all" }, bg);
    expect(next.background).toBe(bg);
    expect(next.profiles.every((p) => resolveBackground(next, p) === bg)).toBe(true);
  });

  it("sets and clears one profile's background, leaving the others", () => {
    const set = withBackground(config(), { kind: "profile", profileId: "a" }, { type: "none" });
    expect(set.profiles.find((p) => p.id === "a")?.background).toEqual({ type: "none" });
    expect(set.profiles.find((p) => p.id === "b")?.background).toBeUndefined();
    const cleared = withBackground(set, { kind: "profile", profileId: "a" }, undefined);
    expect(cleared.profiles.find((p) => p.id === "a")?.background).toBeUndefined();
  });

  it("keys undo steps per scope", () => {
    expect(backgroundKey({ kind: "all" })).toBe("background:all");
    expect(backgroundKey({ kind: "profile", profileId: "a" })).toBe("background:a");
  });
});

describe("withBackgroundType", () => {

  it("moves an image to the poster when switching to video", () => {
    expect(withBackgroundType({ type: "image", src: "/a.png", dim: 20 }, "video")).toEqual({
      type: "video",
      poster: "/a.png",
      dim: 20,
    });
    expect(withBackgroundType({ type: "image", src: "/a.png", poster: "/p.jpg" }, "video")).toEqual({
      type: "video",
      poster: "/p.jpg",
    });
  });

});
