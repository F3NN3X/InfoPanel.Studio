// @vitest-environment happy-dom
// The sensor picker draws only the rows in view, keeps its section headers, and stays keyboard-reachable.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SensorPicker } from "@/components/infopanel/edit/sensor-picker";
import type { DataPoint } from "@/lib/data-points";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
);

const SOURCES = ["Alpha", "Beta", "Gamma", "Delta"];
const point = (n: number): DataPoint => ({
  key: `libre.s${n}`,
  name: `Sensor ${n}`,
  sourceId: "s",
  sourceName: SOURCES[Math.floor(n / 250)],
  containerId: `s/${Math.floor(n / 250)}`,
  containerRawId: "",
  containerTitle: "",
  raw: String(n),
  type: "number",
  num: n,
  unit: "",
  kind: "",
});
const points = Array.from({ length: 1000 }, (_, n) => point(n));
const sensors = Object.fromEntries(points.map((p, n) => [p.key, { value: n, name: p.name, ...(n % 2 === 0 ? { ref: `libre:/amdcpu/0/load/${n}` } : {}) }]));

vi.mock("@/lib/catalog", () => ({
  refreshCatalog: () => Promise.resolve(),
  useSensorCatalog: () => ({ status: "ok", sensors }),
}));
vi.mock("@/lib/use-data-model", () => ({ useDataModel: () => ({ points }) }));

function open(current: string | null = null) {
  const onPick = vi.fn();
  render(<SensorPicker open onOpenChange={() => {}} title="Choose a sensor" pluginOnly={false} current={current} onPick={onPick} />);
  return onPick;
}
const rowsIn = () => [...document.querySelectorAll<HTMLElement>("[data-row]")];
const scroller = () => screen.getByRole("listbox", { name: "Sensors" });
const scrollTo = (top: number) => {
  scroller().scrollTop = top;
  act(() => {
    fireEvent.scroll(scroller());
  });
};

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("SensorPicker rows", () => {
  it("draws a window of the 200 capped sensors, not all of them", () => {
    open();
    const n = rowsIn().length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(20);
  });

  it("keeps the section grouping: a labelled header row above its sensors", () => {
    open();
    expect(screen.getByRole("group", { name: "Alpha" })).toBeTruthy();
  });

  it("marks the current sensor selected and gives each row its tooltip", () => {
    open("libre.s1");
    const options = within(scroller()).getAllByRole("option");
    const selected = options.filter((o) => o.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain("Sensor 1");
    expect(selected[0].getAttribute("title")).toContain("libre.s1");
    expect(selected[0].textContent).toContain("preview only");
    expect(options[0].getAttribute("title")).toBe("libre:/amdcpu/0/load/0");
  });

  it("picks the sensor clicked", () => {
    const onPick = open();
    fireEvent.click(within(scroller()).getAllByRole("option")[0]);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ key: "libre.s0", ref: "libre:/amdcpu/0/load/0" }));
  });

  it("is one Tab stop on a sensor, and Up and Down skip the section headers", () => {
    open();
    const rows = rowsIn();
    expect(rows.every((r) => r.getAttribute("role") === "option")).toBe(true);
    expect(rows.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    rows[0].focus();
    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1], { key: "ArrowUp" });
    expect(document.activeElement).toBe(rows[0]);
    // Above the first sensor there is only a header: nothing to land on.
    fireEvent.keyDown(rows[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(rows[0]);
  });

  it("reaches the last sensor with End and the first again with Home", () => {
    open();
    const first = rowsIn()[0];
    first.focus();
    fireEvent.keyDown(first, { key: "End" });
    expect((document.activeElement as HTMLElement).textContent).toContain("Sensor 199");
    expect(rowsIn().length).toBeLessThan(20);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home" });
    expect((document.activeElement as HTMLElement).textContent).toContain("Sensor 0");
  });

  it("draws rows further down once scrolled", () => {
    open();
    scrollTo(30 + 48 * 100);
    const names = rowsIn().map((r) => r.textContent ?? "");
    expect(names.some((t) => t.includes("Sensor 100"))).toBe(true);
    expect(names.some((t) => t.includes("Sensor 0"))).toBe(false);
  });

  it("starts a new search at the top and says so when nothing matches", () => {
    open();
    scrollTo(30 + 48 * 100);
    fireEvent.change(screen.getByRole("textbox", { name: "Search sensors" }), { target: { value: "sensor 15" } });
    expect(rowsIn()[0].textContent).toContain("Sensor 15");
    fireEvent.change(screen.getByRole("textbox", { name: "Search sensors" }), { target: { value: "zzzz" } });
    expect(rowsIn()).toHaveLength(0);
    expect(screen.getByText("No sensors match.")).toBeTruthy();
  });

  it("resets to the top with the first sensor as the Tab stop, in the same list element", () => {
    open();
    const before = scroller();
    scrollTo(30 + 48 * 100);
    fireEvent.change(screen.getByRole("textbox", { name: "Search sensors" }), { target: { value: "sensor 15" } });
    expect(scroller()).toBe(before);
    expect(scroller().scrollTop).toBe(0);
    expect(rowsIn()[0].getAttribute("tabindex")).toBe("0");
    expect(rowsIn().filter((r) => r.getAttribute("tabindex") === "0")).toHaveLength(1);
  });
});
