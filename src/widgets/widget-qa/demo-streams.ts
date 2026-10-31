import { AUDIO_EVENTS_URL } from "@/lib/audio-control";
import { CHAT_EVENTS_URL } from "@/lib/chat";
import { EXTRAS_EVENTS_URL } from "@/lib/extras";

/**
 * Demo streams for `?widget-qa&data=fixtures`: the streaming widgets read OBS, chat and audio from the server's event
 * streams, so the page answers those three URLs itself (6 OBS scenes, 40 chat lines on both platforms, 6 mixer
 * channels) and leaves every other stream to the real EventSource. Dev-only, like the rest of `widget-qa`.
 */

const SCENES = ["Gameplay", "Just Chatting", "Starting Soon", "Be Right Back", "Interview", "Ending"].map((name, i) => ({ id: `scene-${i}`, name, sub: `Scene ${i + 1}`, icon: "" }));

const USERS = ["zed", "mod_rock", "kairo", "neonwolf", "pixelhuse", "drift", "ola_b", "yt_marta"];
const LINES = ["that replay was insane", "be nice in chat or the face gets you", "GG", "LETS GOOOO", "what is that screen under your monitor??", "W streamer", "spacs are in the panels below", "hi from youtube!"];

const chat = () => ({
  messages: Array.from({ length: 40 }, (_, i) => ({
    id: `m${i}`,
    platform: i % 3 === 2 ? "youtube" : "twitch",
    user: USERS[i % USERS.length],
    text: `${LINES[i % LINES.length]}${i % 7 === 0 ? " and a much longer message that has to wrap onto a second line of the chat" : ""}`,
    color: i % 2 ? "#60a5fa" : "#f472b6",
    badge: ["", "mod", "", "vip", "sub", "", "", "broadcaster"][i % 8],
    ts: 1_700_000_000_000 + i * 4000,
  })),
  platforms: { twitch: { connected: true, channel: "demo" }, youtube: { connected: true, channel: "Demo" } },
});

const extras = () => ({
  obs: { configured: true, connected: true, streaming: true, recording: false, scenes: SCENES, currentScene: "scene-1", uptime: 5196, kbps: 6000, fps: 60, mic: { name: "Mic/Aux", muted: false, level: 40 }, replay: { active: true }, inputs: ["Mic/Aux"] },
  twitch: { configured: true, signedIn: true, login: "demo", channel: "demo", connected: true, live: true, viewers: 1243 },
  youtube: { clientConfigured: true, signedIn: true, channel: "Demo", live: true, viewers: 312, connected: true },
});

const device = (id: string, name: string, volume: number, muted = false, def = false) => ({ id, name, volume, muted, default: def });
const audio = () => ({
  windows: {
    available: true,
    outputs: [device("out1", "Headset (USB audio)", 72, false, true)],
    inputs: [device("in1", "Wave:3 microphone", 86, false, true)],
    apps: [["game.exe", "Game", 64], ["discord.exe", "Discord", 50], ["spotify.exe", "Spotify", 36], ["chrome.exe", "Chrome", 28]].map(([id, name, volume]) => ({ id, name, volume, muted: false, deviceId: "out1" })),
  },
  wavelink: { status: "absent", channels: [], mixes: [] },
});

const STREAMS: Record<string, () => unknown> = { [EXTRAS_EVENTS_URL]: extras, [AUDIO_EVENTS_URL]: audio, [CHAT_EVENTS_URL]: chat };

class DemoEventSource {
  readyState = 1;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  private timer: ReturnType<typeof setTimeout>;
  constructor(url: string) {
    this.timer = setTimeout(() => {
      this.onopen?.();
      this.onmessage?.({ data: JSON.stringify(STREAMS[url]()) });
    }, 0);
  }
  close() {
    clearTimeout(this.timer);
    this.readyState = 2;
  }
}

/** Answers the three streams above with demo data from now on; call before any widget mounts. */
export function installDemoStreams(): void {
  const Real = window.EventSource;
  window.EventSource = new Proxy(Real, {
    construct: (target, args: [string, EventSourceInit?]) => (args[0] in STREAMS ? (new DemoEventSource(args[0]) as unknown as EventSource) : new target(...args)),
  });
}
