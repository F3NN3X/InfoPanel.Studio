// @vitest-environment happy-dom
// The layout variants a widget draws (`meta.layouts`, src/widgets/layouts.ts): each lays out the same data its own way, and with
// no layout named the widget draws its standard markup, as every old config and every other pack does.
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_EXTRAS, type CalendarEvent, type Extras } from "@/lib/extras";

const NOW = new Date(2026, 10, 24, 9, 0).getTime();
const mocks = vi.hoisted(() => ({ extras: null as Extras | null }));
vi.mock("@/widgets/time-hooks", async (original) => ({
  ...(await original<typeof import("@/widgets/time-hooks")>()),
  useExtras: () => mocks.extras,
  useNow: () => NOW,
}));

import Calendar from "@/widgets/calendar/Calendar";
import DayPlanner from "@/widgets/day-planner/DayPlanner";
import NetworkThroughput from "@/widgets/network-throughput/NetworkThroughput";
import SensorValue from "@/widgets/SensorValue";
import { fixtureSensors } from "@/widgets/__fixtures__";
import { toFlat } from "@/widgets/shared/data-adapter";

const event = (title: string, start: Date, minutes = 60): CalendarEvent => ({ id: `${title}@${start.getTime()}`, title, start: start.getTime(), end: start.getTime() + minutes * 60_000, allDay: false });
const DATE = { "plugins.clock-plugin.clock.day": "24", "plugins.clock-plugin.clock.month": "11", "plugins.clock-plugin.clock.year": "2026" };

const box = (w: number, h: number) =>
  class {
    constructor(private cb: ResizeObserverCallback) {}
    observe(el: Element) {
      this.cb([{ target: el, contentRect: { width: w, height: h }, borderBoxSize: [{ inlineSize: w, blockSize: h }] } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  };
const drawIn = (w: number, h: number, ui: React.ReactElement) => {
  vi.stubGlobal("ResizeObserver", box(w, h));
  return render(ui).container;
};

beforeEach(() => {
  mocks.extras = { ...EMPTY_EXTRAS, calendar: { configured: true, events: [event("Standup", new Date(2026, 10, 25, 10, 0)), event("Review", new Date(2026, 10, 25, 14, 0))] } };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Calendar's month navigator", () => {
  it("draws six weeks, today framed, the next event's day as the slab and its date in the footer", () => {
    const el = drawIn(300, 300, <Calendar data={DATE} lookLayout="grid-nav" />);
    const nav = el.querySelector("[data-layout=grid-nav]")!;
    expect(nav).not.toBeNull();
    expect(nav.querySelectorAll("button")).toHaveLength(2);
    expect(nav.textContent).toContain("November");
    expect(el.querySelector("[data-today]")?.textContent).toBe("24");
    const slab = el.querySelector("[data-selected]")!;
    expect(slab.textContent).toBe("25");
    expect(slab.getAttribute("data-part")).toBe("num");
    expect(nav.textContent).toContain("2026.11.25");
    expect(nav.textContent).toContain("Standup //");
  });

  it("keeps a narrow footer to the selected day and the event's time, not its title cut short", () => {
    const el = drawIn(220, 220, <Calendar data={DATE} lookLayout="grid-nav" />);
    const foot = el.querySelector("[data-layout=grid-nav] [data-part=mono]")!;
    expect(foot.textContent).toBe(new Date(2026, 10, 25, 10, 0).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));
    expect(foot.getAttribute("title")).toContain("Standup //");
    expect(el.textContent).toContain("2026.11.25");
  });

  it("hatches Sunday's column only and strikes its days through, as the kit's calendar does", () => {
    const el = drawIn(300, 300, <Calendar data={DATE} lookLayout="grid-nav" />);
    const rest = [...el.querySelectorAll("[data-rest]")];
    // six weeks: one rest day a week, every one a Sunday
    expect(rest).toHaveLength(6);
    expect(rest.map((c) => c.textContent)).toEqual(["1", "8", "15", "22", "29", "6"]);
    expect(rest[0].querySelector("span")?.className).toContain("line-through");
    // Saturday the 28th is a plain day
    const sat = [...el.querySelectorAll("[data-layout=grid-nav] span")].find((s) => s.textContent === "28" && !s.hasAttribute("data-rest"))!;
    expect(sat.className).not.toContain("line-through");
  });

  it("selects today, and says so, when nothing is planned; pages the month with its buttons", () => {
    mocks.extras = { ...EMPTY_EXTRAS, calendar: { configured: false, events: [] } };
    const el = drawIn(300, 300, <Calendar data={DATE} lookLayout="grid-nav" />);
    expect(el.querySelector("[data-selected]")?.textContent).toBe("24");
    expect(el.textContent).toContain("No calendar");
    fireEvent.click(el.querySelector("button[aria-label='Next month']")!);
    expect(el.textContent).toContain("December");
    // today is not in December: nothing is framed, the footer still reads the selected day
    expect(el.querySelector("[data-today]")).toBeNull();
    expect(el.textContent).toContain("2026.11.24");
  });

  it("is the standard calendar when no layout is named", () => {
    const el = drawIn(300, 300, <Calendar data={DATE} />);
    expect(el.querySelector("[data-layout]")).toBeNull();
    expect(el.querySelector("[data-selected]")).toBeNull();
  });
});

describe("the other layouts", () => {
  const data = toFlat(fixtureSensors());

  it("Day Planner's board lists the coming events with when they start", () => {
    const el = drawIn(320, 320, <DayPlanner data={{}} lookLayout="board" />);
    const rows = el.querySelectorAll("[data-layout=board] li");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Standup");
  });

  it("Network Traffic's signal graph draws the two rates as readouts over the graph", () => {
    const el = drawIn(420, 300, <NetworkThroughput data={data} adapter="ethernet" lookLayout="signal" />);
    const signal = el.querySelector("[data-layout=signal]")!;
    expect(signal).not.toBeNull();
    expect(signal.textContent).toMatch(/Download.*Upload/);
    expect(signal.querySelector("[data-part=spark] svg")).not.toBeNull();
  });

  it("Sensor's readout takes a value display and leaves a gauge to the standard layout", () => {
    const key = Object.keys(data).find((k) => /_download_speed$/.test(k))!;
    const readout = drawIn(300, 300, <SensorValue data={data} sensor={key} lookLayout="readout" />);
    expect(readout.querySelector("[data-layout=readout]")).not.toBeNull();
    cleanup();
    const gauge = drawIn(300, 300, <SensorValue data={data} sensor={key} display="gauge" lookLayout="readout" />);
    expect(gauge.querySelector("[data-layout]")).toBeNull();
  });
});
