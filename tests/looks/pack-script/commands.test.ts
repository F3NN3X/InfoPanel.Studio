import { describe, expect, it } from "vitest";
import { checkCommands, type Ctx2D, replay } from "@/looks/pack-script/commands";
import { BLUR_MAX, COMMANDS_MAX, COORD_MAX, COST_MAX, DASH_MAX, DOT_R_MAX, DOTS_MAX, FRAME_DOTS_MAX, FRAME_POINTS_MAX, GRADIENTS_MAX, LINE_MAX, PATH_POINTS_MAX, SCALE_MAX, STOPS_MAX } from "@/looks/pack-script/limits";

// What the host draws of a script's commands: nothing out of shape, every number held to its range, the frame cut at the caps.

const FRAME = { palette: 3, cards: [{ texts: [{ x: 5, y: 6, w: 7, h: 8, n: 3 }] }] };
const check = (raw: unknown) => checkCommands(raw, FRAME);

describe("checkCommands", () => {
  it("keeps each kind in shape, with its paint defaults", () => {
    const { commands, refused, capped } = check([
      { op: "rect", x: 1, y: 2, w: 3, h: 4, fill: 0 },
      { op: "arc", x: 1, y: 2, r: 3, stroke: 2, alpha: 0.5, width: 2 },
      { op: "path", points: [0, 0, 10, 10], close: true, fill: 1 },
      { op: "glyph", card: 0, text: 0, fill: 0, alpha: 0.2 },
      { op: "transform", m: [1, 0, 0, 1, 5, 5] },
      { op: "reset" },
    ]);
    expect(refused).toBe(0);
    expect(capped).toBe(false);
    expect(commands).toEqual([
      { op: "rect", x: 1, y: 2, w: 3, h: 4, fill: 0, alpha: 1, width: 1 },
      { op: "arc", x: 1, y: 2, r: 3, start: 0, end: 2 * Math.PI, stroke: 2, alpha: 0.5, width: 2 },
      { op: "path", points: [0, 0, 10, 10], close: true, fill: 1, alpha: 1, width: 1 },
      { op: "glyph", card: 0, text: 0, fill: 0, alpha: 0.2, width: 1 },
      { op: "transform", m: [1, 0, 0, 1, 5, 5] },
      { op: "reset" },
    ]);
  });

  it("drops what is out of shape: an unknown op, a colour outside the palette or as CSS, no paint, a NaN, a bad glyph or path", () => {
    const { commands, refused } = check([
      { op: "image", src: "http://x/" },
      { op: "rect", x: 0, y: 0, w: 1, h: 1, fill: 3 },
      { op: "rect", x: 0, y: 0, w: 1, h: 1, fill: "url(http://x/)" },
      { op: "rect", x: 0, y: 0, w: 1, h: 1 },
      { op: "rect", x: Number.NaN, y: 0, w: 1, h: 1, fill: 0 },
      { op: "rect", x: 0, y: 0, w: 1, h: 1, fill: 0, alpha: "1" },
      { op: "glyph", card: 1, text: 0, fill: 0 },
      { op: "glyph", card: 0, text: 1, fill: 0 },
      { op: "path", points: [0, 0, 1], fill: 0 },
      { op: "path", points: [0, 0], fill: 0 },
      { op: "transform", m: [1, 0, 0, 1, 0] },
      null,
      "rect",
      [1, 2],
    ]);
    expect(commands).toEqual([]);
    expect(refused).toBe(14);
    expect(check({ op: "reset" }).refused).toBe(1);
  });

  it("clamps coordinates, lengths, alpha, line width, angles and the transform's scale and move", () => {
    const { commands } = check([
      { op: "rect", x: -1e9, y: 1e9, w: -5, h: 1e9, fill: 0, alpha: 7, width: 99 },
      { op: "arc", x: 0, y: 0, r: 1, start: -100, end: 100, fill: 0 },
      { op: "transform", m: [100, -100, 100, -100, 1e9, -1e9] },
    ]);
    expect(commands[0]).toMatchObject({ x: -COORD_MAX, y: COORD_MAX, w: 0, h: COORD_MAX, alpha: 1, width: LINE_MAX });
    expect(commands[1]).toMatchObject({ start: -4 * Math.PI, end: 4 * Math.PI });
    expect(commands[2]).toEqual({ op: "transform", m: [SCALE_MAX, -SCALE_MAX, SCALE_MAX, -SCALE_MAX, COORD_MAX, -COORD_MAX] });
  });

  it("cuts the frame at COMMANDS_MAX and refuses paths past the point caps", () => {
    const many = check(Array.from({ length: COMMANDS_MAX + 1 }, () => ({ op: "reset" })));
    expect(many.commands.length).toBe(COMMANDS_MAX);
    expect(many.capped).toBe(true);
    const long = Array.from({ length: (PATH_POINTS_MAX + 1) * 2 }, () => 1);
    expect(check([{ op: "path", points: long, fill: 0 }]).refused).toBe(1);
    const full = Array.from({ length: PATH_POINTS_MAX * 2 }, () => 1);
    const paths = Array.from({ length: Math.ceil(FRAME_POINTS_MAX / PATH_POINTS_MAX) + 1 }, () => ({ op: "path", points: full, fill: 0 }));
    const r = check(paths);
    expect(r.commands.length).toBe(Math.floor(FRAME_POINTS_MAX / PATH_POINTS_MAX));
    expect(r.refused).toBe(paths.length - r.commands.length);
  });
});

describe("replay", () => {
  /** A context that records every call and every paint it was given. */
  const recorder = () => {
    const calls: string[] = [];
    const ctx = new Proxy({ globalAlpha: 1, fillStyle: "", strokeStyle: "", lineWidth: 1 } as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : (...args: unknown[]) => calls.push(`${String(k)}(${args.join(",")})`)),
      set: (t, k, v) => {
        t[k as string] = v;
        calls.push(`${String(k)}=${v}`);
        return true;
      },
    }) as unknown as Ctx2D;
    return { ctx, calls };
  };

  it("paints by palette index on the base scale, a transform on top of it, a glyph as its box", () => {
    const { ctx, calls } = recorder();
    const { commands } = check([{ op: "transform", m: [2, 0, 0, 2, 10, 0] }, { op: "glyph", card: 0, text: 0, fill: 1, stroke: 2, alpha: 0.5, width: 3 }, { op: "reset" }]);
    replay(ctx, commands, ["#000", "#111", "#222"], FRAME.cards, 0.5);
    expect(calls).toEqual(["setTransform(0.5,0,0,0.5,0,0)", "setTransform(1,0,0,1,5,0)", "beginPath()", "rect(5,6,7,8)", "globalAlpha=0.5", "fillStyle=#111", "fill()", "strokeStyle=#222", "lineWidth=3", "stroke()", "setTransform(0.5,0,0,0.5,0,0)", "globalAlpha=1"]);
  });
});

// The v2 primitives: each is checked like the first four, and replayed on the one context the host owns.

const GRAD = { op: "gradient", id: 0, x0: 0, y0: 0, x1: 0, y1: 10, stops: [[0, 0, 0], [1, 1]] };
const BOXED = { palette: 3, cards: [{ x: 10, y: 20, w: 100, h: 50, texts: [{ x: 5, y: 6, w: 20, h: 8, n: 3 }] }] };

/** A context that records calls and sets; methods not given are no-ops. */
function plain(calls: string[], extra: Record<string, unknown> = {}) {
  const ctx: Record<string, unknown> = { globalAlpha: 1, ...extra };
  return new Proxy(ctx, {
    get: (t, k) => (k in t ? t[k as string] : (...args: unknown[]) => void calls.push(`${String(k)}(${args.join(",")})`)),
    set: (t, k, v) => {
      t[k as string] = v;
      calls.push(`${String(k)}=${typeof v === "object" ? "[gradient]" : v}`);
      return true;
    },
  }) as unknown as Ctx2D;
}

describe("gradient", () => {
  it("is defined by id with palette stops (alpha defaults to 1), linear or radial, and a shape names it as its fill or stroke", () => {
    const r = check([GRAD, { op: "gradient", id: 1, x0: 1, y0: 2, r0: 0, x1: 1, y1: 2, r1: 9, stops: [[0, 2, 0.5], [2, 1]] }, { op: "rect", x: 0, y: 0, w: 4, h: 4, fillGrad: 0, strokeGrad: 1 }]);
    expect(r.refused).toBe(0);
    expect(r.commands[0]).toEqual({ op: "gradient", id: 0, x0: 0, y0: 0, x1: 0, y1: 10, stops: [{ at: 0, color: 0, alpha: 0 }, { at: 1, color: 1, alpha: 1 }] });
    expect(r.commands[1]).toMatchObject({ r0: 0, r1: 9, stops: [{ at: 0, color: 2, alpha: 0.5 }, { at: 1, color: 1, alpha: 1 }] });
    expect(r.commands[2]).toEqual({ op: "rect", x: 0, y: 0, w: 4, h: 4, fillGrad: 0, strokeGrad: 1, alpha: 1, width: 1 });
  });

  it("refuses a bad id, too few or too many stops, a colour outside the palette, CSS, a half-radial one, and a shape naming one not defined or both fill kinds", () => {
    const stops = (n: number) => Array.from({ length: n }, (_, i) => [i / n, 0]);
    const r = check([
      { ...GRAD, id: GRADIENTS_MAX },
      { ...GRAD, stops: [[0, 0]] },
      { ...GRAD, stops: stops(STOPS_MAX + 1) },
      { ...GRAD, stops: [[0, 3], [1, 0]] },
      { ...GRAD, stops: [[0, "red"], [1, 0]] },
      { ...GRAD, stops: [[0, 0, "1"], [1, 0]] },
      { ...GRAD, r0: 1 },
      { op: "rect", x: 0, y: 0, w: 1, h: 1, fillGrad: 0 },
      GRAD,
      { op: "rect", x: 0, y: 0, w: 1, h: 1, fill: 0, fillGrad: 0 },
      { op: "rect", x: 0, y: 0, w: 1, h: 1, fillGrad: 1 },
    ]);
    expect(r.commands.length).toBe(1);
    expect(r.refused).toBe(10);
  });

  it("replays as a canvas gradient in the palette's own colours, an alpha stop mixed to transparent", () => {
    const calls: string[] = [];
    const grad = { addColorStop: (at: number, c: string) => calls.push(`stop(${at},${c})`) };
    const ctx = plain(calls, { createLinearGradient: (...a: number[]) => (calls.push(`linear(${a})`), grad), createRadialGradient: (...a: number[]) => (calls.push(`radial(${a})`), grad) });
    const { commands } = check([GRAD, { op: "gradient", id: 1, x0: 1, y0: 2, r0: 3, x1: 4, y1: 5, r1: 6, stops: [[0, 1], [1, 2, 0.25]] }, { op: "rect", x: 0, y: 0, w: 1, h: 1, fillGrad: 1 }]);
    replay(ctx, commands, ["#000", "#111", "#222"], FRAME.cards);
    expect(calls).toEqual(expect.arrayContaining(["linear(0,0,0,10)", "stop(0,color-mix(in srgb, #000 0%, transparent))", "radial(1,2,3,4,5,6)", "stop(0,#111)", "stop(1,color-mix(in srgb, #222 25%, transparent))", "fillStyle=[gradient]"]));
  });
});

describe("style", () => {
  it("holds a dash, its phase, cap, join, a glow and a safe composite mode, with defaults", () => {
    expect(check([{ op: "style" }]).commands).toEqual([{ op: "style", phase: 0, cap: "butt", join: "miter", blur: 0, mode: "source-over" }]);
    const r = check([{ op: "style", dash: [6, 3], phase: -12, cap: "round", join: "bevel", blur: 8, glow: 2, mode: "lighter" }]);
    expect(r.commands[0]).toEqual({ op: "style", dash: [6, 3], phase: -12, cap: "round", join: "bevel", blur: 8, glow: 2, mode: "lighter" });
  });

  it("refuses a mode outside the safe set, a bad cap, join, dash or glow colour; holds the glow and dash to their caps; drops a dash that is all zero", () => {
    const bad = check([{ op: "style", mode: "destination-out" }, { op: "style", mode: "difference" }, { op: "style", cap: "x" }, { op: "style", join: 1 }, { op: "style", dash: [1] }, { op: "style", dash: "1,2" }, { op: "style", glow: 3 }, { op: "style", blur: "9" }]);
    expect(bad.commands).toEqual([]);
    expect(bad.refused).toBe(8);
    const held = check([{ op: "style", blur: 99, dash: [999, -5], phase: 1e9 }, { op: "style", dash: [0, 0] }]);
    expect(held.commands[0]).toMatchObject({ blur: BLUR_MAX, dash: [DASH_MAX, 0], phase: DASH_MAX * 8 });
    expect(held.commands[1]).not.toHaveProperty("dash");
  });

  it("is replayed as line state, and a shadow only while the glow is on; the end of the frame undoes it", () => {
    const calls: string[] = [];
    const { commands } = check([{ op: "style", dash: [4, 2], phase: 3, cap: "round", join: "round", blur: 5, mode: "screen" }, { op: "rect", x: 0, y: 0, w: 1, h: 1, stroke: 1 }]);
    replay(plain(calls), commands, ["#000", "#111", "#222"], FRAME.cards, 2);
    expect(calls).toEqual(expect.arrayContaining(["setLineDash(4,2)", "lineDashOffset=3", "lineCap=round", "lineJoin=round", "globalCompositeOperation=screen", "shadowBlur=10", "shadowColor=#111", "shadowBlur=0"]));
    expect(calls.slice(-6)).toEqual(["setLineDash()", "lineDashOffset=0", "lineCap=butt", "lineJoin=miter", "globalCompositeOperation=source-over", "globalAlpha=1"]);
    const none: string[] = [];
    replay(plain(none), check([{ op: "rect", x: 0, y: 0, w: 1, h: 1, fill: 0 }]).commands, ["#000"], FRAME.cards);
    expect(none.some((c) => /shadow|setLineDash|Composite/.test(c))).toBe(false);
  });
});

describe("clip", () => {
  it("clips to a card's box outside any transform until unclip, and a frame never ends clipped", () => {
    const calls: string[] = [];
    const { commands, refused } = checkCommands([{ op: "transform", m: [2, 0, 0, 2, 0, 0] }, { op: "clip", card: 0 }, { op: "rect", x: 0, y: 0, w: 1, h: 1, fill: 0 }, { op: "clip", card: 1 }, { op: "clip", card: 0 }], BOXED);
    expect(refused).toBe(1);
    replay(plain(calls), commands, ["#000"], BOXED.cards);
    expect(calls).toEqual([
      "setTransform(1,0,0,1,0,0)", "setTransform(2,0,0,2,0,0)", "save()", "setTransform(1,0,0,1,0,0)", "beginPath()", "rect(10,20,100,50)", "clip()", "setTransform(2,0,0,2,0,0)",
      "beginPath()", "rect(0,0,1,1)", "globalAlpha=1", "fillStyle=#000", "fill()",
      "restore()", "setTransform(2,0,0,2,0,0)", "save()", "setTransform(1,0,0,1,0,0)", "beginPath()", "rect(10,20,100,50)", "clip()", "setTransform(2,0,0,2,0,0)",
      "restore()", "setTransform(2,0,0,2,0,0)", "globalAlpha=1",
    ]);
  });

  it("reapplies the style after a clip ends, since the restore brings back the one saved", () => {
    const calls: string[] = [];
    const { commands } = checkCommands([{ op: "style", cap: "round" }, { op: "clip", card: 0 }, { op: "unclip" }], BOXED);
    replay(plain(calls), commands, ["#000"], BOXED.cards);
    expect(calls.filter((c) => c === "lineCap=round").length).toBe(2);
  });
});

describe("textbox", () => {
  // the text box in FRAME is x 5, y 6, w 7, h 8
  const boxes = (extra: object) => {
    const calls: string[] = [];
    const { commands, refused } = checkCommands([{ op: "textbox", card: 0, text: 0, fill: 0, ...extra }], FRAME);
    replay(plain(calls), commands, ["#000"], FRAME.cards);
    return { refused, rect: calls.find((c) => c.startsWith("rect(")) };
  };

  it("lights a box (grown by pad), underlines it, or wipes a fraction of it from a side: only ever the box", () => {
    expect(boxes({ kind: "highlight", pad: 2 }).rect).toBe("rect(3,4,11,12)");
    expect(boxes({ kind: "underline", width: 2 }).rect).toBe("rect(5,14,7,2)");
    expect(boxes({ kind: "underline", width: 0 }).rect).toBe("rect(5,14,7,1)");
    expect(boxes({ kind: "wipe", p: 0.5 }).rect).toBe("rect(5,6,3.5,8)");
    expect(boxes({ kind: "wipe", p: 0.5, side: "right" }).rect).toBe("rect(8.5,6,3.5,8)");
    expect(boxes({ kind: "wipe", p: 0.25, side: "top" }).rect).toBe("rect(5,6,7,2)");
    expect(boxes({ kind: "wipe", p: 0.25, side: "bottom" }).rect).toBe("rect(5,12,7,2)");
  });

  it("refuses an unknown kind or side, a text that is not there, a bad p, and holds p to 0..1 and pad to its cap", () => {
    expect(boxes({ kind: "invert" }).refused).toBe(1);
    expect(boxes({ kind: "wipe", side: "diag" }).refused).toBe(1);
    expect(boxes({ kind: "wipe", p: "1" }).refused).toBe(1);
    expect(boxes({ kind: "wipe", text: 3 }).refused).toBe(1);
    expect(check([{ op: "textbox", card: 0, text: 0, kind: "wipe", p: 9, pad: 99, fill: 0 }]).commands[0]).toMatchObject({ p: 1, pad: 8 });
  });
});

describe("points", () => {
  it("is a batch of dots or squares in one paint, held to the per-command and the frame's dot caps", () => {
    const ok = check([{ op: "points", points: [1, 2, 3, 4], r: 99, fill: 0 }, { op: "points", points: [1, 2], shape: "square", stroke: 1 }]);
    expect(ok.commands[0]).toMatchObject({ op: "points", points: [1, 2, 3, 4], r: DOT_R_MAX, round: true });
    expect(ok.commands[1]).toMatchObject({ r: 1, round: false });
    const bad = check([{ op: "points", points: [], fill: 0 }, { op: "points", points: [1, 2, 3], fill: 0 }, { op: "points", points: Array.from({ length: (DOTS_MAX + 1) * 2 }, () => 1), fill: 0 }, { op: "points", points: [1, 2], r: "2", fill: 0 }]);
    expect(bad.refused).toBe(4);
    const batch = Array.from({ length: DOTS_MAX * 2 }, () => 1);
    const many = check(Array.from({ length: Math.ceil(FRAME_DOTS_MAX / DOTS_MAX) + 1 }, () => ({ op: "points", points: batch, fill: 0 })));
    expect(many.commands.length).toBe(Math.floor(FRAME_DOTS_MAX / DOTS_MAX));
  });

  it("draws 500 particles as one path and one fill, costing 11", () => {
    const calls: string[] = [];
    const { commands, cost } = check([{ op: "points", points: Array.from({ length: 1000 }, (_, i) => i), r: 1, fill: 0 }]);
    replay(plain(calls), commands, ["#000"], FRAME.cards);
    expect(calls.filter((c) => c === "fill()").length).toBe(1);
    expect(calls.filter((c) => c.startsWith("arc(")).length).toBe(500);
    expect(cost).toBe(11);
  });
});

describe("cost", () => {
  it("counts a glow's blur against every shape under it and cuts the frame at COST_MAX", () => {
    const rect = { op: "rect", x: 0, y: 0, w: 1, h: 1, fill: 0 };
    const r = check([{ op: "style", blur: BLUR_MAX }, ...Array.from({ length: 400 }, () => rect)]);
    expect(r.capped).toBe(true);
    expect(r.cost).toBeLessThanOrEqual(COST_MAX);
    expect(r.commands.length).toBe(1 + Math.floor((COST_MAX - 1) / (1 + BLUR_MAX)));
    const flat = check(Array.from({ length: 400 }, () => rect));
    expect(flat.capped).toBe(false);
    expect(flat.cost).toBe(400);
  });

  it("costs a gradient fill one more than a solid one", () => {
    expect(check([GRAD, { op: "rect", x: 0, y: 0, w: 1, h: 1, fillGrad: 0 }]).cost).toBe(2 + 2);
  });
});
