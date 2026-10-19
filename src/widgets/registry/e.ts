// Template widgets, group E: the plain plugin cards that had no template (see docs/redesign/phase9/gaps.md).
// Each module's options are exported for the schema tests (`e.schema.test.ts`).
import { notificationsIsland } from "../island/info";
import { styleSubsetSettings } from "@/modules/standard-settings";
import type { DashboardModule, ModuleSetting } from "@/modules/types";
import { templateModule, type TemplateOptions } from "../module";
import { INSPECTOR_META } from "./inspector-meta";
import { boolOf, boolSetting, enumSetting, numberOf, numberSetting, stringOf, textSetting } from "./settings-kit";
import Bluetooth, { meta as bluetoothMeta, type BluetoothProps } from "../Bluetooth";
import Departures, { meta as departuresMeta, type DeparturesProps } from "../Departures";
import Notifications, { meta as notificationsMeta, type NotificationsProps } from "../Notifications";
import StreamDeck, { meta as streamDeckMeta, type StreamDeckProps } from "../StreamDeck";
import TextFile, { meta as textFileMeta, type TextFileProps } from "../TextFile";
import WebPage, { meta as webPageMeta, type WebPageProps } from "../WebPage";

/**
 * A web page has no layout of its own: a URL, and its declared look subset (size and corners, an
 * accent, the frame's edge; the page covers any surface). No header, no small-zone views.
 */
export const WEBPAGE_SETTINGS: ModuleSetting[] = [
  textSetting("url", "URL", "", { group: "Page" }),
  ...styleSubsetSettings(INSPECTOR_META.WebPage.styleSubset ?? []),
];

export const webPageOptions: TemplateOptions<Pick<WebPageProps, "url">> = {
  meta: webPageMeta,
  Component: WebPage,
  base: [],
  settings: WEBPAGE_SETTINGS,
  toProps: (s) => ({ url: String(s.url ?? "") }),
};

export const TEXTFILE_SETTINGS: ModuleSetting[] = [boolSetting("showMeta", "Size / lines / status header", true, { group: "Content" })];

export const textFileOptions: TemplateOptions<Pick<TextFileProps, "showMeta">> = {
  meta: textFileMeta,
  Component: TextFile,
  settings: TEXTFILE_SETTINGS,
  toProps: (s) => ({ showMeta: boolOf(s.showMeta) }),
};

export const NOTIFICATIONS_SETTINGS: ModuleSetting[] = [
  boolSetting("showHistory", "History list", true, { group: "Content" }),
  numberSetting("maxLines", "Max history lines", 50, { min: 1, max: 200, step: 5, group: "Content" }),
];

export const notificationsOptions: TemplateOptions<Pick<NotificationsProps, "showHistory" | "maxLines">> = {
  meta: notificationsMeta,
  Component: Notifications,
  settings: NOTIFICATIONS_SETTINGS,
  toProps: (s) => ({ showHistory: boolOf(s.showHistory), maxLines: numberOf(s.maxLines) }),
  island: notificationsIsland,
};

export const DEPARTURES_SETTINGS: ModuleSetting[] = [boolSetting("showStatus", "Status line", true, { group: "Content" })];

export const departuresOptions: TemplateOptions<Pick<DeparturesProps, "showStatus">> = {
  meta: departuresMeta,
  Component: Departures,
  settings: DEPARTURES_SETTINGS,
  toProps: (s) => ({ showStatus: boolOf(s.showStatus) }),
};

/** `view` bundles the three toggles through `applies` (each view sets all three), as the legacy widget did; the toggles carry the behaviour. */
export const BLUETOOTH_SETTINGS: ModuleSetting[] = [
  enumSetting(
    "view",
    "View",
    "full",
    [
      { value: "full", label: "Status + devices", applies: { showStatus: true, showDevices: true, showBattery: true } },
      { value: "devices", label: "Devices + battery", applies: { showStatus: false, showDevices: true, showBattery: true } },
      { value: "status", label: "Status only", applies: { showStatus: true, showDevices: false, showBattery: false } },
    ],
    { group: "Content" },
  ),
  boolSetting("showStatus", "Bluetooth status", true, { group: "Content" }),
  boolSetting("showDevices", "Paired devices", true, { group: "Content" }),
  boolSetting("showBattery", "Battery levels", true, { group: "Content" }),
  { key: "batteryMidColor", label: "Battery medium color", type: "color", default: "", group: "Battery colors" },
  { key: "batteryLowColor", label: "Battery low color", type: "color", default: "", group: "Battery colors" },
];

export const bluetoothOptions: TemplateOptions<Pick<BluetoothProps, "showStatus" | "showDevices" | "showBattery" | "batteryMidColor" | "batteryLowColor">> = {
  meta: bluetoothMeta,
  Component: Bluetooth,
  settings: BLUETOOTH_SETTINGS,
  toProps: (s) => ({
    showStatus: boolOf(s.showStatus),
    showDevices: boolOf(s.showDevices),
    showBattery: boolOf(s.showBattery),
    batteryMidColor: stringOf(s.batteryMidColor),
    batteryLowColor: stringOf(s.batteryLowColor),
  }),
};

export const STREAMDECK_SETTINGS: ModuleSetting[] = [
  boolSetting("showProfile", "Active profile", true, { group: "Content" }),
  boolSetting("showLabels", "Button labels", true, { group: "Content" }),
];

export const streamDeckOptions: TemplateOptions<Pick<StreamDeckProps, "showProfile" | "showLabels">> = {
  meta: streamDeckMeta,
  Component: StreamDeck,
  settings: STREAMDECK_SETTINGS,
  toProps: (s) => ({ showProfile: boolOf(s.showProfile), showLabels: boolOf(s.showLabels) }),
};

export const GROUP_E: DashboardModule[] = [
  templateModule(webPageOptions),
  templateModule(textFileOptions),
  templateModule(notificationsOptions),
  templateModule(departuresOptions),
  templateModule(bluetoothOptions),
  templateModule(streamDeckOptions),
];
