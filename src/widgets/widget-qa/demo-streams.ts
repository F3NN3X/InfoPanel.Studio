import { AUDIO_EVENTS_URL } from "@/lib/audio-control";
import { CHAT_EVENTS_URL } from "@/lib/chat";
import { EXTRAS_EVENTS_URL } from "@/lib/extras";
import { STREAMDECK_EVENTS_URL } from "@/lib/streamdeck";
import { WL_PREFIX } from "@/lib/wavelink";
import { WL_LIVE } from "../__fixtures__/wavelink";

/**
 * Demo streams for `?widget-qa` on fixture data (the default): the streaming widgets read OBS, chat, audio, the
 * coding agents and the Stream Deck from the server's event streams, so the page answers those four URLs itself (6 OBS
 * scenes, 40 chat lines on both platforms, 6 mixer channels, three agent sessions with plan use and two weeks of tokens,
 * a 5x3 Stream Deck "demo" with titles and no icons: the icon route has no deck behind it here) and leaves every other
 * stream to the real EventSource. Dev-only, like the rest of `widget-qa`.
 */

// `data=stress` (installDemoStreams(true)) lengthens every name and line and adds sessions, to find what breaks.
let stress = false;
/** A name, made long under stress. */
const L = (s: string) => (stress && s ? `${s} with a much longer name than usual` : s);

const scenes = () => ["Gameplay", "Just Chatting", "Starting Soon", "Be Right Back", "Interview", "Ending"].map((name, i) => ({ id: `scene-${i}`, name: L(name), sub: `Scene ${i + 1}`, icon: "" }));

const USERS = ["zed", "mod_rock", "kairo", "neonwolf", "pixelhuse", "drift", "ola_b", "yt_marta"];
const LINES = ["that replay was insane", "be nice in chat or the face gets you", "GG", "LETS GOOOO", "what is that screen under your monitor??", "W streamer", "spacs are in the panels below", "hi from youtube!"];

const chat = () => ({
  messages: Array.from({ length: 40 }, (_, i) => ({
    id: `m${i}`,
    platform: i % 3 === 2 ? "youtube" : "twitch",
    user: stress ? `${USERS[i % USERS.length]}_the_very_long_username` : USERS[i % USERS.length],
    text: `${LINES[i % LINES.length]}${stress || i % 7 === 0 ? " and a much longer message that has to wrap onto a second line of the chat" : ""}`,
    color: i % 2 ? "#60a5fa" : "#f472b6",
    badge: ["", "mod", "", "vip", "sub", "", "", "broadcaster"][i % 8],
    ts: 1_700_000_000_000 + i * 4000,
  })),
  platforms: { twitch: { connected: true, channel: "demo" }, youtube: { connected: true, channel: "Demo" } },
});

const DAY = 86_400_000;
/** Two weeks of token use, ending today, growing towards today. */
const usageDays = (now: number, scale: number) =>
  Array.from({ length: 14 }, (_, i) => {
    const input = Math.round(scale * (40 + ((i * 37) % 60)) * 1000);
    const output = Math.round(input * 0.18);
    const cacheRead = input * 6;
    const cacheWrite = Math.round(input * 0.4);
    return { day: new Date(now - (13 - i) * DAY).toISOString().slice(0, 10), input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite };
  });

/** Three sessions (working, waiting for permission, done), both agents' plan windows and two weeks of usage. */
const agents = () => {
  const now = Date.now();
  const usage = (scale: number) => {
    const days = usageDays(now, scale);
    return {
      today: days[13].total,
      history: days.reduce((n, d) => n + d.total, 0),
      days,
      breakdown: { today: { projects: [{ name: L("InfoPanel.Studio"), total: Math.round(days[13].total * 0.7) }, { name: "ips-server", total: Math.round(days[13].total * 0.3) }], models: [{ name: "opus", total: Math.round(days[13].total * 0.8) }, { name: "sonnet", total: Math.round(days[13].total * 0.2) }] } },
    };
  };
  const extra = stress ? Array.from({ length: 5 }, (_, i) => ({ key: `x${i}`, agent: i % 2 ? "codex" : "claude", project: L(`side-project-${i + 1}`), state: "working", since: now - (i + 1) * 60_000, turnStart: now - (i + 1) * 60_000, tool: "Read", model: "claude-opus-5-5" })) : [];
  return {
    sessions: [
      ...extra,
      { key: "s1", agent: "claude", project: L("InfoPanel.Studio"), state: "working", since: now - 95_000, turnStart: now - 95_000, tool: "Edit", subagents: 1, context: 42, cost: 3.12, model: "claude-opus-5-5" },
      { key: "s2", agent: "codex", project: L("ips-server"), state: "waiting", since: now - 20_000, tool: "Bash", model: "gpt-5" },
      { key: "s3", agent: "claude", project: L("docs"), state: "done", since: now - 600_000, lastTurnMs: 240_000, context: 18, cost: 0.41, model: "claude-sonnet-5-5" },
    ],
    plan: {
      claude: { fiveHour: { used: 38, resetsAt: now + 2 * 3_600_000 }, sevenDay: { used: 61, resetsAt: now + 3 * DAY }, extra: [{ name: "opus", used: 44, resetsAt: now + 3 * DAY }], version: "2.4.0", at: now },
      codex: { fiveHour: { used: 12, resetsAt: now + 4 * 3_600_000 }, sevenDay: { used: 27, resetsAt: now + 5 * DAY }, at: now },
    },
    usage: { claude: usage(1), codex: usage(0.35) },
  };
};

const extras = () => ({
  obs: { configured: true, connected: true, streaming: true, recording: false, scenes: scenes(), currentScene: "scene-1", uptime: 5196, kbps: 6000, fps: 60, mic: { name: "Mic/Aux", muted: false, level: 40 }, replay: { active: true }, inputs: ["Mic/Aux"] },
  twitch: { configured: true, signedIn: true, login: "demo", channel: "demo", connected: true, live: true, viewers: 1243 },
  youtube: { clientConfigured: true, signedIn: true, channel: "Demo", live: true, viewers: 312, connected: true },
  agents: agents(),
});

const device = (id: string, name: string, volume: number, muted = false, def = false) => ({ id, name: L(name), volume, muted, default: def });
const audio = () => ({
  windows: {
    available: true,
    outputs: [device("out1", "Headset (USB audio)", 72, false, true)],
    inputs: [device("in1", "Wave:3 microphone", 86, false, true)],
    apps: [["game.exe", "Game", 64], ["discord.exe", "Discord", 50], ["spotify.exe", "Spotify", 36], ["chrome.exe", "Chrome", 28]].map(([id, name, volume]) => ({ id, name: L(name as string), volume, muted: false, deviceId: "out1" })),
  },
  wavelink: { status: "absent", channels: [], mixes: [] },
});

const KEY_TITLES = ["Scene 1", "Scene 2", "Mute mic", "Replay", "Go live", "Chat", "Music", "Lights", "BRB", "Clip", "Zoom", "Discord", "Macro", "Volume", ""];
const streamdeck = () => ({
  enabled: true,
  pairingCode: "AB12CD",
  devices: [{ id: "demo", name: "IPStudio", cols: 5, rows: 3, status: "ready", page: { current: 0, total: 3 }, keys: KEY_TITLES.flatMap((title, index) => (title ? [{ index, title: L(title), icon: null }] : [])) }],
});

const STREAMS: Record<string, () => unknown> = { [EXTRAS_EVENTS_URL]: extras, [AUDIO_EVENTS_URL]: audio, [CHAT_EVENTS_URL]: chat, [STREAMDECK_EVENTS_URL]: streamdeck };

/** The Wave Link client reads its plugin's two sensors off the sensor stream (`/events?prefix=…`): a connected Wave Link. */
const wavelink = () => ({ sensors: { [`${WL_PREFIX}status`]: { text: "up" }, [`${WL_PREFIX}state`]: { text: JSON.stringify(WL_LIVE) } } });

/** The demo payload for a stream URL, or undefined for one the page leaves to the real EventSource. */
function demoFor(url: string): (() => unknown) | undefined {
  if (url in STREAMS) return STREAMS[url];
  const u = new URL(url, window.location.href);
  return u.pathname.endsWith("/events") && u.searchParams.get("prefix") === WL_PREFIX ? wavelink : undefined;
}

class DemoEventSource {
  readyState = 1;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  private timer: ReturnType<typeof setTimeout>;
  constructor(payload: () => unknown) {
    this.timer = setTimeout(() => {
      this.onopen?.();
      this.onmessage?.({ data: JSON.stringify(payload()) });
    }, 0);
  }
  close() {
    clearTimeout(this.timer);
    this.readyState = 2;
  }
}

/** Answers the streams above with demo data from now on (long and full with `withStress`); call before any widget mounts. */
export function installDemoStreams(withStress = false): void {
  stress = withStress;
  const Real = window.EventSource;
  window.EventSource = new Proxy(Real, {
    construct: (target, args: [string, EventSourceInit?]) => {
      const payload = demoFor(args[0]);
      return payload ? (new DemoEventSource(payload) as unknown as EventSource) : new target(...args);
    },
  });
}
