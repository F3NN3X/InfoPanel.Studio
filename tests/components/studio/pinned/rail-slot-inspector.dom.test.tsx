// @vitest-environment happy-dom
// A rail slot holding a widget: the Widget select follows the preset the slot stores (the view tells Device Batteries'
// three rail presets apart), picking one redraws it, and the widget's own options edit the slot's settings.
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RailSlotInspector } from "@/components/studio/pinned/rail-slot-inspector";
import { useRailWidgets, type RailWidget } from "@/components/studio/pinned/rail-editor";
import type { RailSlot } from "@/lib/pinned";

// no live server: the touch and device pickers read an empty stream
vi.mock("@/hooks/useSensors", () => ({ useSensors: () => ({}) }));
vi.mock("@/components/studio/touch-rows", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/components/studio/touch-rows")>()), useTouchSources: () => ({ inputs: [], outputs: [], scenes: [] }), TouchRows: () => null }));
vi.mock("@/widgets/recipe/use-recipes", () => ({ loadUserRailWidgets: () => Promise.resolve([]) }));

afterEach(cleanup);

const slot = (settings: Record<string, string | boolean>, name = "Device Batteries · Rail: three devices"): RailSlot => ({ id: "s1", group: "widgets", name, target: { kind: "widget", module: "DeviceBatteries", settings } });

async function railWidgets(): Promise<readonly RailWidget[]> {
  const { result } = renderHook(() => useRailWidgets());
  await waitFor(() => expect(result.current.length).toBeGreaterThan(0));
  return result.current;
}

function inspect(s: RailSlot, widgets: readonly RailWidget[]) {
  const onChange = vi.fn();
  render(<RailSlotInspector slot={s} pages={[]} widgets={widgets} onChange={onChange} onRemove={vi.fn()} />);
  /** What the last change makes of the slot. */
  const after = (): RailSlot => onChange.mock.calls.at(-1)![0](s);
  return { onChange, after };
}

describe("the rail widgets", () => {
  it("store their preset's view, which is what tells Device Batteries' presets apart", async () => {
    const batteries = (await railWidgets()).filter((w) => w.module === "DeviceBatteries");
    expect(batteries.map((w) => [w.name, w.settings.view])).toEqual([
      ["Device Batteries · Rail: lowest charge", "lowest"],
      ["Device Batteries · Rail: three devices", "list"],
      ["Device Batteries · Rail: one device", "single"],
    ]);
  });
});

describe("the Widget select", () => {
  it("shows the preset the slot stores, not the first of its widget", async () => {
    const widgets = await railWidgets();
    inspect(slot({ view: "list", compact: "full" }), widgets);
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "Widget" }).value).toBe("Device Batteries · Rail: three devices");
  });

  it("stores the picked preset's view and settings, renames a slot still named for the old one and keeps its other options", async () => {
    const widgets = await railWidgets();
    const { after } = inspect(slot({ view: "list", compact: "full", showIcon: false }), widgets);
    fireEvent.change(screen.getByRole("combobox", { name: "Widget" }), { target: { value: "Device Batteries · Rail: one device" } });
    expect(after()).toMatchObject({ name: "Device Batteries · Rail: one device", target: { settings: { view: "single", compact: "full", showIcon: false } } });
  });

  it("reads a view the presets do not offer as Custom", async () => {
    inspect(slot({ view: "tiles", compact: "full" }), await railWidgets());
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "Widget" }).value).toBe("custom");
  });
});

describe("the widget options", () => {
  it("list the options a rail slot offers for a widget that names them, and none for one that does not", async () => {
    const widgets = await railWidgets();
    inspect(slot({ view: "list", compact: "full" }), widgets);
    expect(screen.getByText("Widget options")).toBeTruthy();
    for (const label of ["View", "Charge as", "Kind icon", "Charging bolt", "Devices", "Battery low soon", "Battery low"]) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    cleanup();
    inspect({ id: "c", group: "widgets", target: { kind: "widget", module: "Clock", settings: {} } }, widgets);
    expect(screen.queryByText("Widget options")).toBeNull();
  });

  it("write a changed option into the slot's settings, keeping the rest", async () => {
    const { after } = inspect(slot({ view: "list", compact: "full" }), await railWidgets());
    fireEvent.click(screen.getByRole("switch", { name: "Kind icon" }));
    expect(after().target).toEqual({ kind: "widget", module: "DeviceBatteries", settings: { view: "list", compact: "full", showIcon: false } });
  });

  it("tick devices and switch them to excluded in one step each", async () => {
    const { after, onChange } = inspect(slot({ view: "list", compact: "full", devices: "7" }), await railWidgets());
    fireEvent.click(screen.getByRole("switch", { name: "Exclude the ticked devices instead" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(after().target).toMatchObject({ settings: { devices: "7", devicesMode: "exclude" } });
  });
});
