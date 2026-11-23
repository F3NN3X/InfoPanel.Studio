// @vitest-environment happy-dom
// The data picker draws only the rows in view, however many points match, and stays keyboard-reachable.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataPicker } from "@/components/studio/inspector/data-picker";
import { PICKER_LIMIT } from "@/components/studio/inspector/bound-data-model";
import type { DataPoint } from "@/lib/data-points";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
);

const point = (n: number): DataPoint => ({
  key: `s.p${n}`,
  name: `Point ${n}`,
  sourceId: "s",
  sourceName: "S",
  containerId: "s/",
  containerRawId: "",
  containerTitle: "",
  raw: String(n),
  type: "text",
  num: null,
  unit: "",
  kind: "",
});
const points = Array.from({ length: 1000 }, (_, n) => point(n));

function open(mode: "widget" | "item", extra: Partial<Parameters<typeof DataPicker>[0]> = {}) {
  const onToggle = vi.fn();
  render(
    <DataPicker open onOpenChange={() => {}} title="Pick" points={points} mode={mode} bound={new Set()} onToggle={onToggle} onOpenExplorer={() => {}} {...extra} />
  );
  return onToggle;
}
const rowsIn = () => [...document.querySelectorAll<HTMLElement>("[data-row]")];
const list = () => screen.getByLabelText("Data points", { selector: "[role]" });
const scrollTo = (top: number) => {
  list().scrollTop = top;
  act(() => {
    fireEvent.scroll(list());
  });
};

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("DataPicker rows", () => {
  it("draws a window of the capped results, not all of them", () => {
    open("item");
    const n = rowsIn().length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(20);
    expect(screen.getByText(`${PICKER_LIMIT}+ results · 0 bound`)).toBeTruthy();
  });

  it("uses option and aria-selected in item mode, and picks the row clicked", () => {
    const onToggle = open("item", { bound: new Set(["s.p1"]) });
    const rows = within(screen.getByRole("listbox", { name: "Data points" })).getAllByRole("option");
    expect(rows.find((r) => r.getAttribute("title") === "s.p1")?.getAttribute("aria-selected")).toBe("true");
    expect(rows[2].getAttribute("aria-selected")).toBe("false");
    expect(rows[0].getAttribute("aria-checked")).toBeNull();
    fireEvent.click(rows[2]);
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ key: rows[2].getAttribute("title") }));
  });

  it("uses checkbox and aria-checked in widget mode", () => {
    open("widget", { bound: new Set(["s.p0"]) });
    const rows = screen.getAllByRole("checkbox");
    expect(rows[0].getAttribute("aria-checked")).toBe("true");
    expect(rows[1].getAttribute("aria-checked")).toBe("false");
    expect(rows[0].getAttribute("aria-selected")).toBeNull();
  });

  it("is one Tab stop, with Up and Down moving between rows", () => {
    open("item");
    const rows = rowsIn();
    expect(rows.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    rows[0].focus();
    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1], { key: "ArrowUp" });
    expect(document.activeElement).toBe(rows[0]);
  });

  it("reaches the last row with End and the first again with Home", () => {
    open("item");
    const first = rowsIn()[0];
    first.focus();
    fireEvent.keyDown(first, { key: "End" });
    expect((document.activeElement as HTMLElement).getAttribute("title")).toBe(`s.p${PICKER_LIMIT - 1}`);
    expect(rowsIn().length).toBeLessThan(20);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home" });
    expect((document.activeElement as HTMLElement).getAttribute("title")).toBe("s.p0");
  });

  it("draws rows further down once scrolled", () => {
    open("item");
    scrollTo(52 * 40);
    const titles = rowsIn().map((r) => r.getAttribute("title"));
    expect(titles).toContain("s.p40");
    expect(titles).not.toContain("s.p0");
  });

  it("starts a new search at the top, and says so when nothing matches", () => {
    open("item");
    scrollTo(52 * 40);
    fireEvent.change(screen.getByRole("textbox", { name: "Search data points" }), { target: { value: "point 1" } });
    expect(rowsIn()[0].getAttribute("title")).toBe("s.p1");
    fireEvent.change(screen.getByRole("textbox", { name: "Search data points" }), { target: { value: "zzzz" } });
    expect(rowsIn()).toHaveLength(0);
    expect(screen.getByText("No data points match.")).toBeTruthy();
    expect(screen.getByText("0 results · 0 bound")).toBeTruthy();
  });

  it("resets to the top with the first row as the Tab stop, in the same list element", () => {
    open("item");
    const before = list();
    scrollTo(52 * 40);
    expect(rowsIn().some((r) => r.getAttribute("tabindex") === "0")).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Search data points" }), { target: { value: "point 1" } });
    expect(list()).toBe(before);
    expect(list().scrollTop).toBe(0);
    expect(rowsIn()[0].getAttribute("tabindex")).toBe("0");
    expect(rowsIn().filter((r) => r.getAttribute("tabindex") === "0")).toHaveLength(1);
  });
});
