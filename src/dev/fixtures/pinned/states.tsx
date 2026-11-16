import type { ReactNode } from "react";
import { Bot, Calculator, Camera, FileText, Folder, Lock, Mic, MicOff, Monitor, Play, Activity, SquareTerminal, Volume1, Volume2, Wrench, Globe, Moon, Zap, Video } from "lucide-react";
import { IslandPrompt, type AgentRequest } from "./island-prompt";
import { KEYS, type KeysSpec } from "./keys";
import { ProfilePicker, type PickerSpec } from "./profile-picker";
import { RAIL, type RailSlot, type RailSpec } from "./rail";
import { RECIPES, recipeZone } from "./recipes";
import { PageGrid, type PageSpec, type Pinned } from "./stage";

/*
 * The pinned-layer states (brief §2), as in-memory data: one profile, "Main", with five pages (Keys, Agents, Mixer, Status,
 * Widgets) and a rail pinned to the left, and a "Studio" profile whose rail the user made (a logo, image and app icons, a
 * mic toggle and a CPU recipe). Every state is laid out for the panel's size, 1024 × 600 or 1920 × 550, so the page is
 * the space the pinned items leave. Sample names and readings are made up; ZCode is not an agent Studio knows (F10).
 */

const RAIL_W = 84;

export interface Scene {
  label: string;
  pinned: Pinned[];
  page: ReactNode;
  overlay?: ReactNode;
  /** The overlay is a modal sheet: what is under it is inert. */
  modal?: boolean;
}

const wide = (w: number, h: number) => w / h > 2.5;

/* ───────── the Main profile's rail ───────── */

const PAGES: RailSlot[] = [
  { id: "p-keys", name: "Keys", group: "pages", target: { kind: "page", pageId: "keys" }, icon: { from: "set", name: "zap" } },
  { id: "p-agents", name: "Agents", group: "pages", target: { kind: "page", pageId: "agents" }, icon: { from: "set", name: "bot" } },
  { id: "p-mixer", name: "Mixer", group: "pages", target: { kind: "page", pageId: "mixer" }, icon: { from: "set", name: "sliders-horizontal" } },
  { id: "p-status", name: "Status", group: "pages", target: { kind: "page", pageId: "status" }, icon: { from: "set", name: "activity" } },
  { id: "p-widgets", name: "Widgets", group: "pages", target: { kind: "page", pageId: "widgets" }, icon: { from: "set", name: "layout-dashboard" } },
];

/** The Main rail: the profile chip, the five pages (Agents badged while one waits), the page lock and the clock. */
export function mainRail(edge: RailSpec["edge"], activePage: string, waiting = true): RailSpec {
  return {
    edge,
    profile: { name: "Main", series: 1 },
    chip: true,
    slots: PAGES.map((s) => (s.id === "p-agents" && waiting ? { ...s, badge: { tone: "warn", say: "an agent needs you" } } : s)),
    activePage,
    lock: "auto",
    clock: true,
  };
}

const img = (file: string) => new URL(`./assets/${file}`, import.meta.url).href;

/** The custom rail of mockup 12: the user's logo, two uploaded images and an app icon, the mic toggle and a CPU recipe. */
export function customRail(activePage: string, logo: "dark" | "light" = "dark"): RailSpec {
  return {
    edge: "left",
    profile: { name: "Studio", series: 3 },
    chip: false,
    slots: [
      { id: "logo", name: logo === "light" ? "Northlight logo" : "Hexmark logo", group: "top", target: { kind: "profile" }, icon: { from: "image", src: img(logo === "light" ? "logo-light.svg" : "logo-dark.svg") }, plate: logo === "light" ? "contrast" : "card" },
      { id: "p-mine", name: "My widgets", group: "pages", target: { kind: "page", pageId: "mine" }, icon: { from: "set", name: "layout-dashboard" } },
      { id: "p-stream", name: "Stream", group: "pages", target: { kind: "page", pageId: "stream" }, icon: { from: "image", src: img("stream.svg") }, shape: "circle", badge: { text: "LIVE", tone: "crit", say: "live on OBS" } },
      { id: "p-home", name: "Home", group: "pages", target: { kind: "page", pageId: "home" }, icon: { from: "image", src: img("home.svg") }, shape: "rounded" },
      { id: "a-chat", name: "Open Chat", group: "actions", target: { kind: "action", action: "open-app" }, icon: { from: "app", exe: "Chat.exe", src: img("chat-app.svg") }, shape: "rounded" },
      { id: "a-mic", name: "Microphone muted", group: "actions", target: { kind: "action", action: "mic-mute" }, icon: { from: "set", name: "mic" }, on: true },
      { id: "w-cpu", name: "CPU mini", group: "widgets", target: { kind: "widget", zone: recipeZone("rail-cpu", RECIPES.cpuMini(), [1, 1, 1, 1], { surface: "flat" }) } },
    ],
    activePage,
    lock: null,
    clock: true,
  };
}

export const railPinned = (rail: RailSpec, picker = false): Pinned => ({
  id: "rail",
  edge: rail.edge,
  size: RAIL_W,
  zone: { id: "rail", design: { mod: RAIL, spec: { rail, picker } }, cell: [1, 1, 1, 1], settings: { radius: 0, surface: "solid" } },
});

/* ───────── pages ───────── */

const keysSpec = (cols: number): KeysSpec => ({
  cols,
  rows: 2,
  legend: true,
  keys: [
    { id: "explorer", name: "Explorer", icon: Folder, series: 3 },
    { id: "terminal", name: "Terminal", icon: SquareTerminal, more: "hold" },
    { id: "calc", name: "Calculator", icon: Calculator },
    { id: "shot", name: "Screenshot", icon: Camera, series: 1, more: "double" },
    { id: "desktop", name: "Show desktop", icon: Monitor, series: 2 },
    { id: "lock", name: "Lock PC", icon: Lock, more: "hold" },
    { id: "vol-down", name: "Volume down", icon: Volume1, series: 4 },
    { id: "vol-up", name: "Volume up", icon: Volume2, series: 4 },
    { id: "mic", name: "Mic muted", icon: MicOff, on: "crit", more: "hold" },
    { id: "play", name: "Play / pause", icon: Play, series: 1, more: "double" },
    { id: "notepad", name: "Notepad", icon: FileText },
    { id: "taskman", name: "Task Manager", icon: Activity, series: 5 },
    ...(cols > 6
      ? [
          { id: "mic2", name: "Push to talk", icon: Mic, series: 2 },
          { id: "bot", name: "Agents", icon: Bot, folder: true },
          { id: "browser", name: "Browser", icon: Globe, series: 2 },
          { id: "sleep", name: "Display off", icon: Moon, more: "hold" as const },
        ]
      : []),
  ],
});

const keysRow = (cols: number): KeysSpec => ({
  cols,
  rows: 1,
  keys: [
    { id: "coffee", name: "Coffee today", icon: Folder, count: 3, series: 3, more: "hold" as const },
    ...(cols > 3 ? [{ id: "macros", name: "Macros", icon: Zap, series: 5, folder: true }, { id: "rec", name: "Record clip", icon: Video, series: 4, more: "double" as const }] : []),
    { id: "apps", name: "Apps", icon: Folder, series: 3, folder: true },
    { id: "tools", name: "Tools", icon: Wrench, folder: true },
  ],
});

/** Keys: two rows of keys, and a row of a now-playing key, a tea timer and three more keys. Live keys are ordinary widgets. */
export function keysPage(w: number, h: number): PageSpec {
  const cols = wide(w, h) ? 8 : 6;
  return {
    cols,
    rows: 3,
    zones: [
      { id: "keys", design: { mod: KEYS, spec: keysSpec(cols) }, cell: [1, 1, cols, 2] },
      { id: "now", module: "NowPlaying", cell: [1, 3, 2, 1], settings: { showHeader: false } },
      { id: "tea", module: "Timer", cell: [3, 3, 1, 1], settings: { showHeader: false, label: "Tea timer" } },
      { id: "keys-2", design: { mod: KEYS, spec: keysRow(cols - 3) }, cell: [4, 3, cols - 3, 1] },
    ],
  };
}

/** Agents: the Coding Agents widget across the page (one session waits). */
export const agentsPage = (): PageSpec => ({ cols: 1, rows: 1, zones: [{ id: "agents", module: "CodingAgents", cell: [1, 1, 1, 1] }] });

const FADERS: [string, string][] = [
  ["master", "Master"],
  ["app:spotify.exe", "Spotify"],
  ["app:chrome.exe", "Chrome"],
  ["app:discord.exe", "Discord"],
  ["mic", "Mic"],
];

/** Mixer: five Audio Faders, vertical in their tall zones. */
export const mixerPage = (): PageSpec => ({
  cols: FADERS.length,
  rows: 1,
  zones: FADERS.map(([channel, name], i) => ({ id: `fader-${i}`, module: "AudioFader", cell: [i + 1, 1, 1, 1], settings: { channel, name, showHeader: false } })),
});

const GAUGES: [string, string][] = [
  ["CPU load", "libre.amd_ryzen_9_9950x3d_cpu_total"],
  ["CPU temp", "libre.amd_ryzen_9_9950x3d_core__tctl_tdie"],
  ["CPU power", "libre.amd_ryzen_9_9950x3d_package"],
  ["GPU load", "libre.nvidia_geforce_rtx_5090_gpu_core_load"],
  ["GPU temp", "libre.nvidia_geforce_rtx_5090_gpu_core"],
  ["GPU power", "libre.nvidia_geforce_rtx_5090_gpu_package"],
  ["RAM", "system.ram.load"],
  ["VRAM", "libre.nvidia_geforce_rtx_5090_gpu_memory_used"],
  ["FPS", "plugins.fps-plugin.fps.fps"],
  ["Down", "libre.ethernet_download_speed"],
  ["Disk read", "libre.kingston_sfyrd2000g_read_rate_throughput"],
  ["RAM used", "libre.total_memory_memory_used"],
  ["1% low", "plugins.fps-plugin.fps.1% low fps"],
  ["Avg FPS", "plugins.InfoPanel.RTSS.rtss.avg-fps"],
];

/** Status: Sensor Value gauges in the room left, `cols` × 2. */
export function statusPage(cols: number): PageSpec {
  return {
    cols,
    rows: 2,
    zones: GAUGES.slice(0, cols * 2).map(([label, sensor], i) => ({ id: `g-${i}`, module: "SensorValue", cell: [(i % cols) + 1, Math.floor(i / cols) + 1, 1, 1], settings: { display: "gauge", label, sensor, showHeader: false } })),
  };
}

/** Widgets: built-in widgets on a 4 × 3 grid (the page the swipe slides to). */
export const widgetsPage = (): PageSpec => ({
  cols: 4,
  rows: 3,
  zones: [
    { id: "uptime", module: "Uptime", cell: [1, 1, 2, 1] },
    { id: "agents", module: "CodingAgents", cell: [3, 1, 2, 1] },
    { id: "cpu", module: "CpuMonitor", cell: [1, 2, 2, 1] },
    { id: "gpu", module: "GpuMonitor", cell: [3, 2, 2, 1] },
    { id: "net", module: "NetworkThroughput", cell: [1, 3, 2, 1] },
    { id: "fps", module: "FpsMonitor", cell: [3, 3, 2, 1] },
  ],
});

/** My widgets: a page of recipes only (mockup 10, decision 10). */
export function recipesPage(w: number, h: number): PageSpec {
  if (wide(w, h))
    return {
      cols: 6,
      rows: 2,
      zones: [
        recipeZone("cpu", RECIPES.cpu(), [1, 1, 2, 1]),
        recipeZone("gpu", RECIPES.gpu(), [1, 2, 2, 1]),
        recipeZone("weather", RECIPES.weather(), [3, 1, 2, 2]),
        recipeZone("ram", RECIPES.ram(), [5, 1, 1, 1]),
        recipeZone("fps", RECIPES.fps(), [6, 1, 1, 1]),
        recipeZone("cpu-temp", RECIPES.cpuTemp(), [5, 2, 1, 1]),
        recipeZone("gpu-temp", RECIPES.gpuTemp(), [6, 2, 1, 1]),
      ],
    };
  return {
    cols: 4,
    rows: 3,
    zones: [
      recipeZone("cpu", RECIPES.cpu(), [1, 1, 2, 1]),
      recipeZone("weather", RECIPES.weather(), [3, 1, 2, 2]),
      recipeZone("gpu", RECIPES.gpu(), [1, 2, 2, 1]),
      recipeZone("ram", RECIPES.ram(), [1, 3, 1, 1]),
      recipeZone("fps", RECIPES.fps(), [2, 3, 1, 1]),
      recipeZone("cpu-temp", RECIPES.cpuTemp(), [3, 3, 1, 1]),
      recipeZone("gpu-temp", RECIPES.gpuTemp(), [4, 3, 1, 1]),
    ],
  };
}

/** Stream: the OBS controls, the now-playing card and the clock (the custom rail's Stream page). */
export const streamPage = (): PageSpec => ({
  cols: 4,
  rows: 3,
  zones: [
    { id: "stream", module: "StreamControl", cell: [1, 1, 2, 2] },
    { id: "on-air", module: "OnAirBeacon", cell: [3, 1, 1, 1] },
    { id: "uptime", module: "Uptime", cell: [4, 1, 1, 1] },
    { id: "mic", module: "AudioButton", cell: [3, 2, 1, 1], settings: { channel: "mic" } },
    { id: "chat", module: "StreamChat", cell: [4, 2, 1, 2] },
    { id: "now", module: "NowPlaying", cell: [1, 3, 3, 1] },
  ],
});

/* ───────── the states ───────── */

const REQUEST: AgentRequest = { agent: "Claude Code", project: "InfoPanel.Studio", command: "npm run build && npm run verify -- --feature dev-fixtures", left: 18, held: 0.45 };

const grid = (page: PageSpec, extra?: Parameters<typeof PageGrid>[0]["style"]) => <PageGrid page={page} style={extra} />;

/** The Now Playing widget pinned to the bottom edge, making room (mockup 04). */
const nowPlayingBar = (): Pinned => ({ id: "now-bar", edge: "bottom", size: 84, inset: 12, zone: { id: "now-bar", module: "NowPlaying", cell: [1, 1, 1, 1], settings: { showHeader: false } } });

/** The Coding Agents widget pinned to the right edge (mockup 09). */
const agentsPanel = (w: number): Pinned => ({ id: "agents-panel", edge: "right", size: w >= 1600 ? 400 : 300, inset: 12, zone: { id: "agents-panel", module: "CodingAgents", cell: [1, 1, 1, 1] } });

export const SCENES = {
  keys: (w: number, h: number): Scene => ({ label: "Keys page beside the rail", pinned: [railPinned(mainRail("left", "keys"))], page: grid(keysPage(w, h)) }),
  agents: (w: number): Scene => ({
    label: "Agents page, one agent waiting",
    pinned: [railPinned(mainRail("left", "agents"))],
    page: grid(agentsPage()),
    overlay: <IslandPrompt request={REQUEST} width={Math.min(560, w - RAIL_W - 48)} />,
  }),
  mixer: (): Scene => ({ label: "Mixer page, rail on the right", pinned: [railPinned(mainRail("right", "mixer"))], page: grid(mixerPage()) }),
  status: (w: number, h: number): Scene => ({ label: "Status page with a now-playing bar", pinned: [railPinned(mainRail("left", "status")), nowPlayingBar()], page: grid(statusPage(wide(w, h) ? 7 : 5)) }),
  swipe: (w: number, h: number): Scene => ({ label: "Swiping from Keys to Widgets under a still rail", pinned: [railPinned(mainRail("left", "keys"))], page: <Swipe from={keysPage(w, h)} to={widgetsPage()} share={0.62} /> }),
  profiles: (w: number, h: number): Scene => ({
    label: "The profile picker open",
    pinned: [railPinned(mainRail("left", "keys"), true)],
    page: <div className="h-full w-full opacity-30">{grid(keysPage(w, h))}</div>,
    modal: true,
    overlay: <ProfilePicker spec={PICKER} left={RAIL_W + 12} top={12} width={Math.min(520, w - RAIL_W - 24)} maxHeight={h - 24} />,
  }),
  bar: (w: number, h: number): Scene => ({ label: "Status with the agents pinned on the right", pinned: [railPinned(mainRail("left", "status")), agentsPanel(w)], page: grid(statusPage(wide(w, h) ? 6 : 3)), overlay: undefined }),
  "custom-rail": (): Scene => ({ label: "A custom rail on the Stream page", pinned: [railPinned(customRail("stream"))], page: grid(streamPage()) }),
  "custom-rail-light-logo": (): Scene => ({ label: "A custom rail with a light logo", pinned: [railPinned(customRail("stream", "light"))], page: grid(streamPage()) }),
  recipes: (w: number, h: number): Scene => ({ label: "A page made only of recipe widgets", pinned: [railPinned(customRail("mine"))], page: grid(recipesPage(w, h)) }),
  rail: (): Scene => ({ label: "The rail alone", pinned: [railPinned(mainRail("left", "keys"))], page: null }),
} as const;

export type SceneName = keyof typeof SCENES;
export const SCENE_NAMES = Object.keys(SCENES) as SceneName[];

const PICKER: PickerSpec = {
  current: "main",
  matches: "coding",
  front: "Code.exe",
  auto: true,
  profiles: [
    { id: "main", name: "Main", series: 1, detail: "Default · 5 pages" },
    { id: "coding", name: "Coding", series: 2, detail: "Auto: Code.exe, WindowsTerminal.exe" },
    { id: "streaming", name: "Streaming", series: 4, detail: "Auto: obs64.exe" },
    { id: "gaming", name: "Gaming", series: 3, detail: "Auto: any full-screen game" },
    { id: "meetings", name: "Meetings", series: 5, detail: "Auto: Teams, Zoom" },
  ],
};

/**
 * Mid-swipe: both pages side by side, slid `share` of the way, under the still rail. The finger's mark shows where the drag
 * is; with reduced motion the switch is instant (no drag follows), so this state does not occur there.
 */
function Swipe({ from, to, share }: { from: PageSpec; to: PageSpec; share: number }) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="flex h-full" style={{ width: "200%", transform: `translateX(-${share * 50}%)` }}>
        <div className="h-full w-1/2">
          <PageGrid page={from} />
        </div>
        <div className="h-full w-1/2" style={{ boxShadow: "-16px 0 32px -16px color-mix(in oklab, var(--w-fg) 25%, transparent)" }}>
          <PageGrid page={to} />
        </div>
      </div>
      <span aria-hidden className="absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: "38%", top: "52%", background: "color-mix(in oklab, var(--w-fg) 22%, transparent)", boxShadow: "inset 0 0 0 2px color-mix(in oklab, var(--w-fg) 45%, transparent)" }} />
    </div>
  );
}
