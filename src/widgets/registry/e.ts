// Template widgets, group E: the plain plugin cards that had no template (see docs/redesign/phase9/gaps.md).
// Each module's options are exported for the schema tests (`e.schema.test.ts`).
import { notificationsIsland } from "../island/info";
import { styleSubsetSettings } from "@/modules/standard-settings";
import type { DashboardModule, ModuleSetting, ModuleSettings } from "@/modules/types";
import { templateModule, type TemplateOptions } from "../module";
import { lazyWidget } from "../lazy-widget";
import { INSPECTOR_META } from "./inspector-meta";
import { boolOf, boolSetting, colorSetting, numberOf, numberSetting, stringOf, textSetting, viewSetting } from "./settings-kit";
import type { BluetoothProps } from "../Bluetooth";
import { meta as bluetoothMeta } from "../meta/Bluetooth";
import type { DeparturesProps } from "../Departures";
import { meta as departuresMeta } from "../meta/Departures";
import type { NotificationsProps } from "../Notifications";
import { meta as notificationsMeta } from "../meta/Notifications";
import type { StreamDeckProps } from "../StreamDeck";
import { meta as streamDeckMeta } from "../meta/StreamDeck";
import type { TextFileProps } from "../TextFile";
import { meta as textFileMeta } from "../meta/TextFile";
import type { WebPageProps } from "../WebPage";
import { meta as webPageMeta } from "../meta/WebPage";

// Each component loads in its own chunk, the first time a zone draws it.
const Bluetooth = lazyWidget(() => import("../Bluetooth"));
const Departures = lazyWidget(() => import("../Departures"));
const Notifications = lazyWidget(() => import("../Notifications"));
const StreamDeck = lazyWidget(() => import("../StreamDeck"));
const TextFile = lazyWidget(() => import("../TextFile"));
const WebPage = lazyWidget(() => import("../WebPage"));

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

export const TEXTFILE_SETTINGS: ModuleSetting[] = [boolSetting("showMeta", "Size / lines / status header", true, { group: "Details" })];

export const textFileOptions: TemplateOptions<Pick<TextFileProps, "showMeta">> = {
  meta: textFileMeta,
  Component: TextFile,
  settings: TEXTFILE_SETTINGS,
  toProps: (s) => ({ showMeta: boolOf(s.showMeta) }),
};

export const NOTIFICATIONS_SETTINGS: ModuleSetting[] = [
  boolSetting("showHistory", "History list", true, { group: "History list" }),
  numberSetting("maxLines", "Max history lines", 50, { min: 1, max: 200, step: 5, group: "History", tab: "behaviour" }),
];

export const notificationsOptions: TemplateOptions<Pick<NotificationsProps, "showHistory" | "maxLines">> = {
  meta: notificationsMeta,
  Component: Notifications,
  settings: NOTIFICATIONS_SETTINGS,
  toProps: (s) => ({ showHistory: boolOf(s.showHistory), maxLines: numberOf(s.maxLines) }),
  island: notificationsIsland,
};

export const DEPARTURES_SETTINGS: ModuleSetting[] = [boolSetting("showStatus", "Status line", true, { group: "Status line" })];

export const departuresOptions: TemplateOptions<Pick<DeparturesProps, "showStatus">> = {
  meta: departuresMeta,
  Component: Departures,
  settings: DEPARTURES_SETTINGS,
  toProps: (s) => ({ showStatus: boolOf(s.showStatus) }),
};

/** The battery colours draw only on listed devices with their levels on. */
const batteriesShown = (v: ModuleSettings) => v.showDevices !== false && v.showBattery !== false;

/** `view` is a preset: it sets the three toggles (each view sets all three), as the legacy widget did; changed afterwards, the row reads Custom. */
export const BLUETOOTH_SETTINGS: ModuleSetting[] = [
  viewSetting(bluetoothMeta, { label: "Preset", group: "Display", hint: "Sets the three toggles below. Change one and the preset reads Custom." }),
  boolSetting("showStatus", "Bluetooth status", true, { group: "Display" }),
  boolSetting("showDevices", "Paired devices", true, { group: "Display" }),
  boolSetting("showBattery", "Battery levels", true, { group: "Display" }),
  // The battery levels follow the theme's Warning and Critical ("" = the widget's own amber and red).
  colorSetting("batteryMidColor", "Battery medium", { role: "warn", more: false, visibleIf: batteriesShown }),
  colorSetting("batteryLowColor", "Battery low", { role: "crit", more: false, visibleIf: batteriesShown }),
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
  boolSetting("showProfile", "Active profile", true, { group: "Profile" }),
  boolSetting("showLabels", "Button labels", true, { group: "Buttons" }),
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
