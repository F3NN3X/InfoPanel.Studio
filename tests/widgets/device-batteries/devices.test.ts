import { describe, expect, it } from "vitest";
import { batteryDeviceOptions, type BatteryDevice } from "@/widgets/device-batteries/devices";

const device = (id: string, name: string, via?: string): BatteryDevice => ({ id, name, via, charging: false, kind: "mouse", low: false, connected: true, asleep: false });

describe("the single device picker's options", () => {
  it("lists the lowest charge first, then each device as Name · via", () => {
    expect(batteryDeviceOptions([device("1", "MX Master 3S", "Bolt"), device("2", "Pad")], "")).toEqual([
      { value: "", label: "Lowest charge" },
      { value: "1", label: "MX Master 3S · Bolt" },
      { value: "2", label: "Pad" },
    ]);
  });

  it("keeps a stored id that is no longer listed selectable, marked not connected", () => {
    const options = batteryDeviceOptions([device("1", "Mouse")], "99");
    expect(options.at(-1)).toEqual({ value: "99", label: "99 (not connected)" });
    expect(batteryDeviceOptions([device("1", "Mouse")], "1")).toHaveLength(2);
  });
});
