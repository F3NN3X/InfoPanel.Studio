import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { modules } from "@/modules";
import { fixtureSensors } from "@/widgets/__fixtures__";
import { cardWidth, rowCount, sizeOf, type Card } from "@/widgets/StatusBar/card-model";
import { CARD_ITEMS, cardReading, fpsOf } from "@/widgets/StatusBar/card-readings";
import { CardView } from "@/widgets/StatusBar/Cards";
import type { Data } from "@/widgets/kit";
import { PRIORITY } from "@/widgets/StatusBar/items";
import { fitByRank } from "@/widgets/StatusBar/layout";

const bar = modules.find((m) => m.id === "StatusBar")!;
// the capture holds a running game's RTSS keys: take them out, so the PresentMon plugin's keys are the only frame rate
const noGame = () => Object.fromEntries(Object.entries(fixtureSensors()).filter(([k]) => !k.startsWith("plugins.InfoPanel.RTSS.")));
const live = { ...noGame(), "plugins.fps-plugin.fps.fps": { value: 144, unit: "" }, "plugins.fps-plugin.fps.1% low fps": { value: 98, unit: "" } } as never;
const idle = { ...noGame(), "plugins.fps-plugin.fps.fps": { value: 0, unit: "" } } as never;
const data = (sensors: object) => sensors as Data;

describe("fitByRank (the presets on a narrow bar)", () => {
  const slots = { left: ["cpu"], center: ["fps"], right: ["gpu", "time"] };
  const rank = (k: string) => ({ time: 1, fps: 2, gpu: 3, cpu: 4 })[k] ?? 0;
  const cost = () => 10;
  it("keeps everything that fits", () => {
    expect(fitByRank(slots, 40, cost, rank)).toEqual(slots);
  });
  it("drops the lowest rank first, from any slot, and never reorders the rest", () => {
    expect(fitByRank(slots, 30, cost, rank)).toEqual({ left: ["cpu"], center: ["fps"], right: ["gpu"] });
    expect(fitByRank(slots, 20, cost, rank)).toEqual({ left: ["cpu"], center: [], right: ["gpu"] });
    expect(fitByRank(slots, 10, cost, rank)).toEqual({ left: ["cpu"], center: [], right: [] });
  });
  it("drops the later of two equal ranks and keeps the last item however narrow", () => {
    expect(fitByRank({ left: ["a", "b"], center: [], right: [] }, 10, cost, () => 1)).toEqual({ left: ["a"], center: [], right: [] });
    expect(fitByRank(slots, 0, cost, rank).left).toEqual(["cpu"]);
  });
  it("ranks the time lowest and the CPU highest in the presets", () => {
    expect(PRIORITY.frameTime).toBeLessThan(PRIORITY.time!);
    expect(PRIORITY.time).toBeLessThan(PRIORITY.fps!);
    expect(PRIORITY.fps).toBeLessThan(PRIORITY.gpuRing!);
    expect(PRIORITY.gpuRing).toBeLessThan(PRIORITY.cpuRing!);
  });
});

describe("drawn item sizes", () => {
  it("fits fewer thin-bar rows as the bar gets lower, down to none", () => {
    expect(rowCount(90, 3)).toBe(3);
    expect(rowCount(90, 2)).toBe(2);
    expect(rowCount(40, 3)).toBeLessThan(3);
    expect(rowCount(20, 3)).toBe(0);
  });
  it("sizes the ring from the bar's height", () => {
    expect(sizeOf(100).ring).toBeGreaterThan(sizeOf(50).ring);
    expect(sizeOf(10).big).toBeGreaterThanOrEqual(11);
  });
  it("makes a card narrower when its rows no longer fit", () => {
    const dual: Card = { kind: "dual", label: "CPU", accent: 1, load: 40, heat: 55, temp: "55°", rows: [{ label: "Power", text: "120 W", pct: 40 }] };
    expect(cardWidth({ ...dual, rows: [] }, 90)).toBeLessThan(cardWidth(dual, 90));
    expect(cardWidth(dual, 20)).toBe(cardWidth({ ...dual, rows: [] }, 20));
  });
});

describe("drawn item readings", () => {
  it("reads the CPU and GPU by role, with rows", () => {
    const d = data(fixtureSensors());
    const cpu = cardReading("cpuDual", d, "c");
    expect(cpu).toMatchObject({ kind: "dual", label: "CPU" });
    expect((cpu as Extract<Card, { kind: "dual" }>).rows.map((r) => r.label)).toEqual(["Power", "Clock", "RAM"]);
    expect(cardReading("gpuRing", d, "c")).toMatchObject({ kind: "ring", label: "GPU" });
    expect(cardReading("cpuLine", d, "f")).toMatchObject({ kind: "line", values: [expect.stringMatching(/%$/), expect.stringMatching(/°$/)] });
  });
  it("reads an Intel CPU's power, clock and package temperature", () => {
    const I = "libre.intel_core_i9_14900k";
    const d = data({
      [`${I}_cpu_total`]: { value: 20, unit: "%" },
      [`${I}_cpu_package`]: { value: 71, unit: "°C" },
      [`${I}_cpu_package_power`]: { value: 120, unit: "W" },
      [`${I}_cpu_core__1_clock`]: { value: 5000, unit: "MHz" },
    });
    expect((cardReading("cpuDual", d, "c") as Extract<Card, { kind: "dual" }>).rows.map((r) => r.text)).toEqual(["120 W", "5.0 GHz"]);
    expect(cardReading("cpuLine", d, "c")).toMatchObject({ values: ["20%", "71°"] });
  });
  it("is nothing on a machine without that hardware", () => {
    for (const key of CARD_ITEMS) expect(cardReading(key, {}, "c")).toBeNull();
  });
  it("shows FPS as a quiet dash when idle and hides the line", () => {
    expect(fpsOf(data(live)).fps).toBe(144);
    expect(fpsOf(data(live)).low).toBe(98);
    expect(cardReading("fps", data(live), "c")).toMatchObject({ kind: "stat", value: "144", low: "98", idle: false });
    expect(cardReading("fpsLine", data(live), "c")).toMatchObject({ kind: "line", values: ["144", "1% 98"] });
    expect(cardReading("frameTime", data(idle), "c")).toBeNull();
    expect(cardReading("fps", data(idle), "c")).toMatchObject({ kind: "stat", value: "–", idle: true });
    expect(cardReading("fpsLine", data(idle), "c")).toBeNull();
  });
});

describe("the status bar presets", () => {
  const views = ["meters", "orbit", "ticker"];
  it.each(views)("%s is a view that adds its own items", (id) => {
    const v = bar.views!.find((x) => x.id === id)!;
    expect(v.applies).toBeDefined();
    expect(v.defaultSize).toEqual([12, 1]);
  });
  it.each(views)("%s renders live and idle without NaN, and with no hardware at all", (id) => {
    const v = bar.views!.find((x) => x.id === id)!;
    const saved = { view: id, ...v.applies };
    for (const sensors of [live, idle, {}]) {
      const html = renderToString(bar.render(sensors, saved) as never);
      expect(html).not.toContain("NaN");
    }
  });
  it("draws every drawn item kind without throwing", () => {
    for (const key of CARD_ITEMS) {
      for (const sensors of [live, idle]) {
        expect(() => renderToString(bar.render(sensors, { view: "pill", left: key, center: "", right: key }) as never)).not.toThrow();
      }
    }
  });
  it("renders a card at both ends of the pill", () => {
    const card = cardReading("cpuRing", data(live), "c")!;
    expect(renderToString(<CardView card={card} u={80} end />)).toContain("CPU");
    expect(renderToString(<CardView card={card} u={80} end={false} />)).toContain("row");
  });
});
