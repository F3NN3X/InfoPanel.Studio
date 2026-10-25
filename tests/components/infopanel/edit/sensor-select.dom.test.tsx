// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SensorSelect } from "@/components/infopanel/edit/sensor-select";
import { rebound } from "@/lib/infopanel/editor/bind";
import { defaultItem } from "@/lib/infopanel/schema";
import { bindingRef, type BoundItem } from "@/lib/infopanel/sensors";

const SOURCES = {
  plugins: [{ id: "demo", name: "Demo", containers: [{ id: "c", name: "C", entries: [{ id: "fps", name: "FPS", type: "sensor", key: "plugins.demo.fps" }] }] }],
};
const SENSORS = {
  "libre.cpu.load": { value: 12, unit: "%", name: "CPU Total", ref: "libre:/amdcpu/0/load/0", source: "infopanel" },
  "libre.gpu.load": { value: 40, unit: "%", name: "GPU Core", ref: "libre:/gpu-nvidia/0/load/0", source: "infopanel" },
  "plugins.demo.fps": { value: 60, unit: "fps", name: "FPS", source: "infopanel" },
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(new Response(JSON.stringify(String(url).endsWith("/api/sources") ? SOURCES : { sensors: SENSORS }), { status: 200 })),
    ),
  );
});

describe("the sensor dropdown", () => {
  it("opens to a search box and the grouped list, filters, and picks by click or Enter", async () => {
    const onPick = vi.fn();
    render(<SensorSelect label="Sensor" current={null} onPick={onPick} />);
    const trigger = screen.getByRole("combobox", { name: "Sensor" });
    expect(trigger.textContent).toContain("Choose a sensor");
    fireEvent.click(trigger);
    const list = await screen.findByRole("listbox", { name: "Sensors" });
    await waitFor(() => expect(within(list).getAllByRole("option")).toHaveLength(3));

    fireEvent.change(screen.getByRole("textbox", { name: "Search sensors" }), { target: { value: "gpu" } });
    const options = within(list).getAllByRole("option");
    expect(options).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search sensors" }), { key: "Enter" });

    expect(onPick).toHaveBeenCalledTimes(1);
    const sensor = onPick.mock.calls[0][0];
    expect(sensor).toMatchObject({ key: "libre.gpu.load", name: "GPU Core", ref: "libre:/gpu-nvidia/0/load/0" });
    // A native pick binds the item's own InfoPanel fields, which the export reads.
    const item = rebound(defaultItem("Sensor") as never, sensor) as BoundItem;
    expect(bindingRef(item)).toBe("libre:/gpu-nvidia/0/load/0");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  it("shows the current sensor's name and reading, and a preview-only pick has no native binding", async () => {
    const onPick = vi.fn();
    render(<SensorSelect label="Sensor" current="libre.cpu.load" onPick={onPick} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Sensor" }));
    const list = await screen.findByRole("listbox", { name: "Sensors" });
    await waitFor(() => expect(within(list).getAllByRole("option").length).toBeGreaterThan(3));
    expect(screen.getByRole("combobox", { name: "Sensor" }).textContent).toContain("CPU Total");
    fireEvent.click(within(list).getByRole("option", { name: /FPS/ }));
    const sensor = onPick.mock.calls[0][0];
    expect(sensor.ref).toBeUndefined();
    const item = defaultItem("Sensor") as never;
    expect(rebound(item, sensor)).toBe(item);
  });
});
