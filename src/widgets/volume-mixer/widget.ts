// Volume Mixer: volume and mute per device. What the registry needs; the component is its own chunk.
import { BOTH, defineWidget } from "../define";
import { volumeMixerIsland } from "../island/audio";
import { audioFlowSetting, audioSettings, flowOfSettings, levelOwnOf, mixerLookOf, mixerViewSettings, pickedDevicesOf } from "../shared/audio-settings";
import { colorSetting, devicesSetting, pick } from "../shared/settings-kit";
import type { VolumeMixerProps } from "./VolumeMixer";
import { meta } from "./meta";

const DEVICE = "Device";

export default defineWidget({
  meta,
  inspector: { header: "yes", compact: BOTH },
  settings: [
    ...audioSettings("showDevice", "showMute").map((d) => (d.key === "showMute" ? { ...d, label: "Show mute state" } : d)),
    // The level follows the theme's OK ("" = the accent).
    colorSetting("levelColor", "Level", { role: "ok", more: false }),
    devicesSetting("Devices (none = all)", "audio", { group: DEVICE }),
    audioFlowSetting(DEVICE),
    ...mixerViewSettings(meta, { orientationKey: "orientation" }),
  ],
  render: {
    load: () => import("./VolumeMixer"),
    // read-only: the volume plugin has no write path
    toProps: (s, saved) => ({ ...pick<VolumeMixerProps>(["showDevice", "showMute", "levelColor"])(s), levelOwn: levelOwnOf(s, saved), devices: pickedDevicesOf(s, "devices"), flow: flowOfSettings(s), mixerLook: mixerLookOf(s, "orientation") }),
  },
  island: volumeMixerIsland,
});
