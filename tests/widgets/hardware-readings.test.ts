import { describe, expect, it } from "vitest";
import { sensorLabel } from "@/widgets/core/data";
import { kindOf, readings } from "@/widgets/hardware-readings";

describe("readings", () => {
  const data = {
    "hwinfo.vcore": "1.21 V",
    "hwinfo.cpu_power": "78.4 W",
    "libre.cpu_fan": "1180 RPM",
    "libre.gpu_core": "54 °C",
    "libre.idle": "0 W",
    "libre.blank": "",
    "system.cpu.load": "12 %",
  };

  it("takes libre and hwinfo keys, skipping empty and zero readings", () => {
    expect(readings(data).map((r) => r.key).sort()).toEqual(["hwinfo.cpu_power", "hwinfo.vcore", "libre.cpu_fan", "libre.gpu_core"]);
  });

  it("ranks temperature, fan, power, other", () => {
    expect(readings(data).map((r) => r.kind)).toEqual(["temp", "fan", "power", "other"]);
  });

  it("splits value and unit and prettifies the label", () => {
    expect(readings(data).find((r) => r.key === "hwinfo.cpu_power")).toMatchObject({ label: "CPU Power", value: 78.4, unit: "W", text: "78.4 W" });
  });

  it.each([
    ["CPU Fan", "", "fan"],
    ["Pump", "RPM", "fan"],
    ["Package Power", "", "power"],
    ["Core", "W", "power"],
    ["Core Temp", "", "temp"],
    ["Core", "°C", "temp"],
    ["Vcore", "V", "other"],
  ])("classifies %s / %s as %s", (name, unit, kind) => {
    expect(kindOf(name, unit)).toBe(kind);
  });
});

describe("sensor names", () => {
  it("falls back to the given label without a name", () => {
    expect(sensorLabel("a", undefined, "Fb")).toBe("Fb");
    expect(sensorLabel("a", { b: "B" }, "Fb")).toBe("Fb");
    expect(sensorLabel("a", { a: "A" }, "Fb")).toBe("A");
  });

  it("labels readings with the sensor's display name, else the prettified key", () => {
    const data = { "libre.gpu_core": "54 °C", "libre.cpu_fan": "1180 RPM" };
    const list = readings(data, { "libre.gpu_core": "GPU Core" });
    expect(list.find((r) => r.key === "libre.gpu_core")?.label).toBe("GPU Core");
    expect(list.find((r) => r.key === "libre.cpu_fan")?.label).toBe("CPU Fan");
  });
});
