// The Stream Deck screen's chat widget. It reads the server's Twitch connection (`src/lib/chat.ts`), not sensor data.
import type { DashboardModule, ModuleSetting } from "@/modules/types";
import { templateModule } from "../module";
import { lazyWidget } from "../lazy-widget";
import type { StreamChatProps } from "../StreamChat";
import { meta as streamChat } from "../meta/StreamChat";
import { boolOf, boolSetting, enumSetting, numberOf, numberSetting, oneOf, stringOf, textSetting } from "./settings-kit";

const StreamChat = lazyWidget(() => import("../StreamChat"));

export const STREAM_CHAT_SETTINGS: ModuleSetting[] = [
  enumSetting(
    "source",
    "Source",
    "twitch",
    [
      { value: "twitch", label: "Twitch" },
      { value: "youtube", label: "YouTube" },
      { value: "both", label: "Both" },
    ],
    { group: "Source", tab: "data" }
  ),
  enumSetting(
    "sendTo",
    "Send to",
    "twitch",
    [
      { value: "twitch", label: "Twitch" },
      { value: "youtube", label: "YouTube" },
    ],
    { group: "Source", tab: "data", visibleIf: (v) => v.source === "both" }
  ),
  textSetting("highlight", "Highlight name", "", { group: "Messages", tab: "show", hint: "Messages with @name are tinted. Empty = the signed-in Twitch name." }),
  boolSetting("showInput", "Show send box", true, { group: "Messages", tab: "show", hint: "Shows only while you are signed in to Twitch and the chat is connected" }),
  enumSetting(
    "textSize",
    "Text size",
    "md",
    [
      { value: "sm", label: "S" },
      { value: "md", label: "M" },
      { value: "lg", label: "L" },
    ],
    { group: "Messages", tab: "style" }
  ),
  numberSetting("maxMessages", "Messages shown", 60, { min: 5, max: 60, step: 5, group: "Messages", tab: "behaviour" }),
  enumSetting(
    "nameColors",
    "Name colours",
    "platform",
    [
      { value: "platform", label: "Platform" },
      { value: "accent", label: "Accent" },
    ],
    { group: "Messages", tab: "style", more: true }
  ),
];

export const GROUP_STREAM_CHAT: DashboardModule[] = [
  templateModule({
    meta: streamChat,
    Component: StreamChat,
    settings: STREAM_CHAT_SETTINGS,
    toProps: (s): Pick<StreamChatProps, "source" | "sendTo" | "highlight" | "showInput" | "textSize" | "maxMessages" | "nameColors"> => ({
      source: oneOf(s.source, ["twitch", "youtube", "both"] as const),
      sendTo: oneOf(s.sendTo, ["twitch", "youtube"] as const),
      highlight: stringOf(s.highlight),
      showInput: boolOf(s.showInput),
      textSize: oneOf(s.textSize, ["sm", "md", "lg"] as const),
      maxMessages: numberOf(s.maxMessages),
      nameColors: oneOf(s.nameColors, ["platform", "accent"] as const),
    }),
  }),
];
