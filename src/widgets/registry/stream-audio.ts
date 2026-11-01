// The Stream Deck screen's audio widgets: the mixer, a one-tap button and a single fader. They read and write the
// server's audio control (Windows audio and Wave Link; `src/lib/audio-control.ts`), not sensor data.
import type { DashboardModule, ModuleSetting } from "@/modules/types";
import { templateModule } from "../module";
import { lazyWidget } from "../lazy-widget";
import { overridesOf } from "../StreamMixer/channels";
import type { AudioButtonProps } from "../AudioButton";
import type { AudioFaderProps } from "../AudioFader";
import type { StreamMixerProps } from "../StreamMixer";
import { meta as audioButton } from "../meta/AudioButton";
import { meta as audioFader } from "../meta/AudioFader";
import { meta as streamMixer } from "../meta/StreamMixer";
import { enumSetting, oneOf, splitKeys, stringOf, textSetting } from "./settings-kit";

const AudioButton = lazyWidget(() => import("../AudioButton"));
const AudioFader = lazyWidget(() => import("../AudioFader"));
const StreamMixer = lazyWidget(() => import("../StreamMixer"));

const FADERS = [
  { value: "leds", label: "LEDs" },
  { value: "bar", label: "Bar" },
];

/** A row listing what the server's audio control offers now (channels, mixes, output devices). */
const audioPick = (key: string, label: string, extra: Partial<ModuleSetting> = {}): ModuleSetting => ({ key, label, type: "select", default: "", optionsFrom: "audio-control", tab: "data", ...extra });

const faderSetting = (): ModuleSetting => enumSetting("fader", "Fader", "leds", FADERS, { group: "Fader" });
const mixSetting = (visibleIf?: ModuleSetting["visibleIf"]): ModuleSetting => audioPick("mix", "Wave Link mix", { group: "Source", hint: "The mix whose levels and mutes the channels use", ...(visibleIf ? { visibleIf } : {}) });
const LINES = "One per line, as channel id = text";

export const STREAM_MIXER_SETTINGS: ModuleSetting[] = [
  enumSetting("source", "Control", "windows", [{ value: "windows", label: "Windows" }, { value: "wavelink", label: "Wave Link" }], { group: "Source", tab: "data" }),
  mixSetting((v) => v.source === "wavelink"),
  audioPick("channels", "Channels (none = all)", { group: "Channels", multiple: true }),
  textSetting("labels", "Names", "", { group: "Channels", multiline: true, tab: "show", hint: `${LINES}, e.g. app:discord.exe = Discord` }),
  textSetting("subs", "Status lines", "", { group: "Channels", multiline: true, tab: "show", more: true, hint: LINES }),
  textSetting("icons", "Icons", "", { group: "Channels", multiline: true, tab: "show", more: true, hint: `${LINES}, with a Material Symbols name` }),
  faderSetting(),
];

export const AUDIO_BUTTON_SETTINGS: ModuleSetting[] = [
  enumSetting("action", "Action", "mute", [{ value: "mute", label: "Mute a channel" }, { value: "output", label: "Switch output" }], { group: "Action", tab: "data" }),
  audioPick("channel", "Channel", { group: "Action", visibleIf: (v) => v.action !== "output" }),
  mixSetting((v) => v.action !== "output" && String(v.channel ?? "").startsWith("wl:")),
  audioPick("device", "Output device", { group: "Action", visibleIf: (v) => v.action === "output" }),
  textSetting("name", "Name", "", { group: "Label", tab: "show" }),
  textSetting("symbol", "Symbol (Material Symbols name)", "", { group: "Label", tab: "show", more: true }),
];

export const AUDIO_FADER_SETTINGS: ModuleSetting[] = [
  audioPick("channel", "Channel", { group: "Channel" }),
  mixSetting((v) => String(v.channel ?? "").startsWith("wl:")),
  textSetting("name", "Name", "", { group: "Channel", tab: "show" }),
  faderSetting(),
];

const sourceOf = (v: unknown) => oneOf(v, ["windows", "wavelink"] as const);
const faderOf = (v: unknown) => oneOf(v, ["leds", "bar"] as const);

export const GROUP_STREAM_AUDIO: DashboardModule[] = [
  templateModule({
    meta: streamMixer,
    Component: StreamMixer,
    settings: STREAM_MIXER_SETTINGS,
    toProps: (s): Pick<StreamMixerProps, "source" | "mix" | "channels" | "labels" | "subs" | "icons" | "fader"> => ({
      source: sourceOf(s.source),
      mix: stringOf(s.mix),
      channels: splitKeys(s.channels),
      labels: overridesOf(s.labels),
      subs: overridesOf(s.subs),
      icons: overridesOf(s.icons),
      fader: faderOf(s.fader),
    }),
  }),
  templateModule({
    meta: audioButton,
    Component: AudioButton,
    settings: AUDIO_BUTTON_SETTINGS,
    toProps: (s): Pick<AudioButtonProps, "action" | "channel" | "mix" | "device" | "name" | "symbol"> => ({
      action: oneOf(s.action, ["mute", "output"] as const),
      channel: stringOf(s.channel),
      mix: stringOf(s.mix),
      device: stringOf(s.device),
      name: stringOf(s.name),
      symbol: stringOf(s.symbol),
    }),
  }),
  templateModule({
    meta: audioFader,
    Component: AudioFader,
    settings: AUDIO_FADER_SETTINGS,
    toProps: (s): Pick<AudioFaderProps, "channel" | "mix" | "name" | "fader"> => ({
      channel: stringOf(s.channel),
      mix: stringOf(s.mix),
      name: stringOf(s.name),
      fader: faderOf(s.fader),
    }),
  }),
];
