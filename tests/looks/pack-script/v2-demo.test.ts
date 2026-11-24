import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { QuickJSWASMModule } from "quickjs-emscripten-core";
import { checkCommands, type DrawCommand } from "@/looks/pack-script/commands";
import { createGuest, loadQuickJS } from "@/looks/pack-script/guest";
import { COST_MAX, type Signals } from "@/looks/pack-script/limits";
import { withEvents } from "@/looks/pack-script/signals";

// The v2 demo script (tests/fixtures/packs/script/v2-demo.js) in the real guest: it must use every new primitive, and the host must keep all of it.

const DEMO = readFileSync("tests/fixtures/packs/script/v2-demo.js", "utf8");
let quickjs: QuickJSWASMModule;
beforeAll(async () => {
  quickjs = await loadQuickJS();
});

const card = (n: number, over: object = {}) => ({ x: n * 200, y: 10, w: 180, h: 120, value: 0.6, state: "ok" as const, texts: [0, 1, 2].map((k) => ({ x: n * 200 + 8, y: 20 + k * 30, w: 90, h: 20, n: 4 })), ...over });
const base: Signals = { level: "full", width: 1000, height: 600, cards: [card(0), card(1)] };

describe("the v2 demo script", () => {
  it("draws each new primitive, all of it passes the host's check, and it stays under the caps", () => {
    const g = createGuest(quickjs, DEMO, { seed: 1, level: "full" });
    if ("fault" in g) throw new Error(g.fault);
    const first = withEvents(undefined, base);
    const f0 = g.frame(0, first);
    expect(f0.fault).toBeUndefined();
    const checked = checkCommands(f0.commands, { palette: 10, cards: first.cards });
    expect(checked.refused).toBe(0);
    expect(checked.capped).toBe(false);
    expect(checked.cost).toBeLessThan(COST_MAX);
    expect([...new Set(checked.commands.map((c) => c.op))].sort()).toEqual(["arc", "clip", "gradient", "path", "points", "rect", "style", "textbox", "unclip"]);
    const kinds = checked.commands.filter((c): c is Extract<DrawCommand, { op: "textbox" }> => c.op === "textbox").map((c) => c.kind);
    expect([...new Set(kinds)].sort()).toEqual(["highlight", "underline", "wipe"]);
    const pts = checked.commands.find((c): c is Extract<DrawCommand, { op: "points" }> => c.op === "points");
    expect(pts?.points.length).toBe(1000);
    g.dispose();
  });

  it("reacts to a card's event for 300 ms; Calm has no particles", () => {
    const calm = createGuest(quickjs, DEMO, { seed: 1, level: "calm" });
    const g = createGuest(quickjs, DEMO, { seed: 1, level: "full" });
    if ("fault" in calm || "fault" in g) throw new Error("fault");
    const seen = withEvents(undefined, base);
    g.frame(0, seen);
    const later = withEvents(seen, { ...base, cards: [card(0, { state: "crit" }), card(1)] });
    const outlines = (t: number) => checkCommands(g.frame(t, t === 100 ? later : undefined).commands, { palette: 10, cards: later.cards }).commands.filter((c) => c.op === "rect" && c.stroke === 5).length;
    expect(outlines(100)).toBe(1);
    expect(outlines(250)).toBe(1);
    expect(outlines(500)).toBe(0);
    const c = checkCommands(calm.frame(0, { ...base, level: "calm" }).commands, { palette: 10, cards: base.cards });
    expect(c.commands.some((x) => x.op === "points")).toBe(false);
    g.dispose();
    calm.dispose();
  });
});
