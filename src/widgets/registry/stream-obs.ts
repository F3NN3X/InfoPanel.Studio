// The Stream Deck screen's OBS widgets: the control tile and a one-tap button. They read the server's OBS connection
// (`useExtras().obs`) and act through `src/lib/obs-control.ts`, not sensor data.
import type { DashboardModule, ModuleSetting } from "@/modules/types";
import { templateModule } from "../module";
import { lazyWidget } from "../lazy-widget";
import type { ObsButtonProps } from "../ObsButton";
import type { StreamControlProps } from "../StreamControl";
import { meta as obsButton } from "../meta/ObsButton";
import { meta as streamControl } from "../meta/StreamControl";
import { boolOf, boolSetting, enumSetting, oneOf, stringOf, textSetting } from "./settings-kit";

const ObsButton = lazyWidget(() => import("../ObsButton"));
const StreamControl = lazyWidget(() => import("../StreamControl"));

export const STREAM_CONTROL_SETTINGS: ModuleSetting[] = [
  boolSetting("showMic", "Show mic", true, { group: "Tiles", hint: "Needs a mic input under Settings › Connections" }),
  boolSetting("showReplay", "Show replay", true, { group: "Tiles", hint: "Needs the replay buffer turned on in OBS" }),
];

export const OBS_BUTTON_SETTINGS: ModuleSetting[] = [
  enumSetting(
    "action",
    "Action",
    "scene",
    [
      { value: "scene", label: "Switch scene" },
      { value: "mic", label: "Mute the mic" },
      { value: "replay", label: "Save replay" },
    ],
    { group: "Action", tab: "data" }
  ),
  { key: "scene", label: "Scene", type: "select", default: "", optionsFrom: "obs-scenes", tab: "data", group: "Action", visibleIf: (v) => v.action === undefined || v.action === "scene" },
  textSetting("name", "Name", "", { group: "Label", tab: "show" }),
  textSetting("symbol", "Symbol (Material Symbols name)", "", { group: "Label", tab: "show", more: true }),
];

export const GROUP_STREAM_OBS: DashboardModule[] = [
  templateModule({
    meta: streamControl,
    Component: StreamControl,
    settings: STREAM_CONTROL_SETTINGS,
    toProps: (s): Pick<StreamControlProps, "showMic" | "showReplay"> => ({ showMic: boolOf(s.showMic), showReplay: boolOf(s.showReplay) }),
  }),
  templateModule({
    meta: obsButton,
    Component: ObsButton,
    settings: OBS_BUTTON_SETTINGS,
    toProps: (s): Pick<ObsButtonProps, "action" | "scene" | "name" | "symbol"> => ({
      action: oneOf(s.action, ["scene", "mic", "replay"] as const),
      scene: stringOf(s.scene),
      name: stringOf(s.name),
      symbol: stringOf(s.symbol),
    }),
  }),
];
