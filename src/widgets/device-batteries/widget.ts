// Device Batteries: the charge of the wireless devices the server polls. What the registry needs; the component is its
// own chunk.
import type { ModuleSettings } from "@/modules/types";
import { BOTH, defineWidget } from "../define";
import { boolOf, boolSetting, colorSetting, oneOf, stringOf, textSetting, viewOnly, viewSetting } from "../shared/settings-kit";
import type { DeviceBatteriesProps } from "./DeviceBatteries";
import { meta } from "./meta";

const VIEWS = ["list", "tiles", "single", "lowest"] as const;

/** Only the single view draws one chosen device. */
const singleOnly = viewOnly(meta, "single");

export default defineWidget({
  meta,
  // A summary card and a dense view of its own.
  inspector: { header: "yes", compact: BOTH },
  settings: [
    viewSetting(meta, { group: "Display" }),
    boolSetting("showCharging", "Charging bolt", true, { group: "Display", hint: "Mark a device that is charging" }),
    boolSetting("showDisconnected", "Disconnected devices", false, {
      group: "Display",
      hint: "A device that is out of range or switched off; an asleep one keeps its row with its last charge either way",
    }),
    // The server's device ids are a hash of its stable key, so they are typed rather than listed; Connections ›
    // Peripherals shows each device with its id.
    singleOnly(textSetting("singleDevice", "Device", "", { group: "Display", hint: "The device id from the battery keys; empty picks the lowest charge" })),
    // The charge colours follow the theme's Warning and Critical ("" = the theme's own), as Bluetooth's bars do.
    colorSetting("batteryWarnColor", "Battery low soon", { role: "warn", more: false }),
    colorSetting("batteryLowColor", "Battery low", { role: "crit", more: false }),
  ],
  render: {
    load: () => import("./DeviceBatteries"),
    toProps: (s: ModuleSettings): Partial<DeviceBatteriesProps> => ({
      view: oneOf(s.view, VIEWS),
      showCharging: boolOf(s.showCharging),
      showDisconnected: boolOf(s.showDisconnected),
      singleDevice: stringOf(s.singleDevice),
      batteryWarnColor: stringOf(s.batteryWarnColor),
      batteryLowColor: stringOf(s.batteryLowColor),
    }),
  },
  // Migrations and sample stay central (the default): the sample is src/widgets/__fixtures__/extra.json's battery keys.
});
