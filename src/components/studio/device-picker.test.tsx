import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ModuleSetting, SensorMap } from "@/modules/types";
import { DevicePicker } from "./setting-pickers";

const sensors: SensorMap = {
  "libre.ethernet_download_speed": { value: 5, unit: "KB/s" },
  "libre.wifi_download_speed": { value: 900, unit: "KB/s" },
  "libre.wifi_upload_speed": { value: 100, unit: "KB/s" },
};
vi.mock("@/lib/catalog", () => ({ useSensorCatalog: () => ({ sensors }) }));

const def: ModuleSetting = { key: "device", label: "Adapter", type: "select", optionsFrom: "adapter", default: "auto" };
const html = (value: string, extra: Partial<ModuleSetting> = {}) =>
  renderToStaticMarkup(<DevicePicker def={{ ...def, ...extra }} kind="adapter" value={value} onChange={() => {}} />);

describe("DevicePicker", () => {
  it("states what Auto picks and what that is now", () => {
    const out = html("auto");
    expect(out).toContain("Busiest adapter · now Wifi");
    expect(out).toMatch(/role="radiogroup"/);
  });

  it("lists the live devices with their readings, and keeps a stored device that is not live", () => {
    const out = html("usb_lan");
    expect(out).toContain("Ethernet");
    expect(out).toContain("usb_lan (not live)");
  });

  it("a multi-device row: a checkbox list with All devices", () => {
    const out = html("", { key: "devices", multiple: true });
    expect(out).toContain("All devices");
    expect(out).not.toContain("radiogroup");
  });
});
