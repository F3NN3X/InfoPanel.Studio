import { describe, expect, it } from "vitest";
import { batteryDeviceOptions, filterDevices, type BatteryDevice } from "@/widgets/device-batteries/devices";

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

describe("the device filter", () => {
  const all = [device("1", "Mouse"), device("2", "Keyboard"), device("3", "Headset")];
  const ids = (list: readonly BatteryDevice[]) => list.map((d) => d.id);

  it("keeps every device when nothing is ticked, in either mode", () => {
    expect(ids(filterDevices(all, "", "include"))).toEqual(["1", "2", "3"]);
    expect(ids(filterDevices(all, undefined, "exclude"))).toEqual(["1", "2", "3"]);
  });

  it("keeps only the ticked devices by default, in the source's order", () => {
    expect(ids(filterDevices(all, "3,1"))).toEqual(["1", "3"]);
    expect(ids(filterDevices(all, " 2 ", "include"))).toEqual(["2"]);
  });

  it("drops the ticked devices in exclude mode, and ignores a ticked id that is gone", () => {
    expect(ids(filterDevices(all, "2,99", "exclude"))).toEqual(["1", "3"]);
  });

  it("limits the single picker's options to the devices it lets through, keeping a stored one that is filtered out", () => {
    const options = batteryDeviceOptions(filterDevices(all, "1", "include"), "2");
    expect(options.map((o) => o.value)).toEqual(["", "1", "2"]);
    expect(options.at(-1)?.label).toBe("2 (not connected)");
  });
});
