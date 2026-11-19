// Device Batteries: the charge of the wireless devices the server polls. What the registry needs; the component is its
// own chunk.
import type { ModuleSettings } from "@/modules/types";
import { BOTH, defineWidget } from "../define";
import { boolOf, boolSetting, colorSetting, enumSetting, oneOf, optionPairs, stringOf, viewOnly, viewSetting } from "../shared/settings-kit";
import type { DeviceBatteriesProps } from "./DeviceBatteries";
import { meta } from "./meta";

const VIEWS = ["list", "tiles", "pills", "single", "lowest"] as const;
const SHOWS = ["both", "percent", "bar"] as const;
const MODES = ["include", "exclude"] as const;

/** Only the single view draws one chosen device. */
const singleOnly = viewOnly(meta, "single");

export default defineWidget({
  meta,
  // A summary card and a dense view of its own.
  inspector: { header: "yes", compact: BOTH },
  // What a 72 px rail slot lets the owner set (the rail item inspector's Widget options).
  railSettings: ["view", "show", "showIcon", "showCharging", "devices", "singleDevice", "batteryWarnColor", "batteryLowColor"],
  settings: [
    viewSetting(meta, { group: "Display" }),
    enumSetting("show", "Charge as", "both", optionPairs(["both", "Bar and percent"], ["percent", "Percent"], ["bar", "Bar"]), { group: "Display" }),
    boolSetting("showIcon", "Kind icon", true, { group: "Display", hint: "The mouse, keyboard or headset glyph before a device" }),
    boolSetting("showCharging", "Charging bolt", true, { group: "Display", hint: "Mark a device that is charging" }),
    boolSetting("showDisconnected", "Disconnected devices", false, {
      group: "Display",
      hint: "A device that is out of range or switched off; an asleep one keeps its row with its last charge either way",
    }),
    // The devices the server polls now (the studio's picker reads their keys); a stored id that is gone stays listed.
    // `devices` ticks which to draw (none = all); `devicesMode`, its second key, keeps or drops them.
    {
      key: "devices",
      keyY: "devicesMode",
      defaultY: "include",
      label: "Devices",
      type: "select",
      default: "",
      optionsFrom: "battery-devices",
      multiple: true,
      group: "Display",
      hint: "None ticked draws every device",
    },
    singleOnly({ key: "singleDevice", label: "Device", type: "select", default: "", optionsFrom: "battery-devices", group: "Display", hint: "Lowest charge picks whichever device is lowest" }),
    // The charge colours follow the theme's Warning and Critical ("" = the theme's own), as Bluetooth's bars do.
    colorSetting("batteryWarnColor", "Battery low soon", { role: "warn", more: false }),
    colorSetting("batteryLowColor", "Battery low", { role: "crit", more: false }),
  ],
  render: {
    load: () => import("./DeviceBatteries"),
    toProps: (s: ModuleSettings): Partial<DeviceBatteriesProps> => ({
      view: oneOf(s.view, VIEWS),
      show: oneOf(s.show, SHOWS),
      showIcon: boolOf(s.showIcon),
      showCharging: boolOf(s.showCharging),
      showDisconnected: boolOf(s.showDisconnected),
      devices: stringOf(s.devices),
      devicesMode: oneOf(s.devicesMode, MODES),
      singleDevice: stringOf(s.singleDevice),
      batteryWarnColor: stringOf(s.batteryWarnColor),
      batteryLowColor: stringOf(s.batteryLowColor),
    }),
  },
  // Migrations and sample stay central (the default): the sample is src/widgets/__fixtures__/extra.json's battery keys.
});
