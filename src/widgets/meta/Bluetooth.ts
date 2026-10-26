// Bluetooth's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

/** The plugin's key prefix. */
export const P = "plugins.bluetooth-battery-plugin.";

export const meta: WidgetMeta = {
  id: "Bluetooth",
  name: "Bluetooth",
  category: "Generic",
  icon: "bluetooth",
  prefixes: [P],
  defaultSize: [3, 2],
  minSize: [2, 1],
  blurb: "Paired devices and their battery levels",
  tags: "bt battery headset mouse",
  description: "Bluetooth status and the paired devices with battery levels from the BTData plugin.",
  views: [
    { id: "full", name: "Status + devices", applies: { showStatus: true, showDevices: true, showBattery: true } },
    { id: "devices", name: "Devices + battery", blurb: "Paired devices and battery, no status", tags: "headset mouse", applies: { showStatus: false, showDevices: true, showBattery: true } },
    { id: "status", name: "Status only", blurb: "Whether Bluetooth is on and connected", tags: "adapter on off", applies: { showStatus: true, showDevices: false, showBattery: false } },
  ],
};
