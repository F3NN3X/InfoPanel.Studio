// The Elgato Stream Deck widget: a virtual deck the dashboard server keeps in the Stream Deck app. It reads the server's
// Stream Deck state (`src/lib/streamdeck.ts`), not sensor data.
import type { DashboardModule, ModuleSetting } from "@/modules/types";
import { templateModule } from "../module";
import { lazyWidget } from "../lazy-widget";
import type { StreamDeckProps } from "../StreamDeck";
import { meta as streamDeck } from "../meta/StreamDeck";
import { boolOf, boolSetting, enumSetting, numberOf, numberSetting, oneOf, stringOf } from "./settings-kit";

const StreamDeck = lazyWidget(() => import("../StreamDeck"));

export const STREAM_DECK_SETTINGS: ModuleSetting[] = [
  { key: "device", label: "Device", type: "select", default: "", optionsFrom: "streamdeck-devices", tab: "data", group: "Device", hint: "A virtual deck in the Stream Deck app. One widget, one device." },
  // The grid lives on the device, not in the widget's saved settings: this row reads it from the server's stream and
  // writes it with `{ op: "grid" }`; the value it is given is never used and it never changes it.
  { key: "grid", label: "Grid", type: "select", default: "", optionsFrom: "streamdeck-grid", tab: "show", group: "Keys" },
  boolSetting("showTitles", "Titles", true, { group: "Keys", tab: "show" }),
  enumSetting(
    "titleSize",
    "Title size",
    "md",
    [
      { value: "sm", label: "S" },
      { value: "md", label: "M" },
      { value: "lg", label: "L" },
    ],
    { group: "Keys", tab: "show", visibleIf: (v) => v.showTitles !== false }
  ),
  boolSetting("showPages", "Page row", true, { group: "Pages", tab: "show", hint: "Shows when the deck has more than one page" }),
  boolSetting("swipe", "Swipe to change page", true, { group: "Pages", tab: "behaviour" }),
  numberSetting("keyGap", "Key gap (px)", 8, { min: 0, max: 24, step: 1, group: "Keys", tab: "style" }),
  numberSetting("keyRadius", "Key corner radius (px)", 0, { min: 0, max: 48, step: 1, group: "Keys", tab: "style", hint: "0 follows the widget's corners" }),
  enumSetting(
    "pressedEffect",
    "Pressed effect",
    "dip",
    [
      { value: "dip", label: "Dip" },
      { value: "glow", label: "Glow" },
      { value: "none", label: "None" },
    ],
    { group: "Keys", tab: "style" }
  ),
];

export const GROUP_STREAM_DECK: DashboardModule[] = [
  templateModule({
    meta: streamDeck,
    Component: StreamDeck,
    settings: STREAM_DECK_SETTINGS,
    toProps: (s): Pick<StreamDeckProps, "device" | "showTitles" | "titleSize" | "showPages" | "swipe" | "keyGap" | "keyRadius" | "pressedEffect"> => ({
      device: stringOf(s.device),
      showTitles: boolOf(s.showTitles),
      titleSize: oneOf(s.titleSize, ["sm", "md", "lg"] as const),
      showPages: boolOf(s.showPages),
      swipe: boolOf(s.swipe),
      keyGap: numberOf(s.keyGap),
      keyRadius: numberOf(s.keyRadius),
      pressedEffect: oneOf(s.pressedEffect, ["dip", "glow", "none"] as const),
    }),
  }),
];
