import { describe, expect, it } from "vitest";
import { checkCommands, type Ctx2D, replay } from "@/looks/pack-script/commands";
import { COMMANDS_MAX, COORD_MAX, FRAME_POINTS_MAX, LINE_MAX, PATH_POINTS_MAX, SCALE_MAX } from "@/looks/pack-script/limits";

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
