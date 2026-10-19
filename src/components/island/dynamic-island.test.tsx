import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { createIslandBus } from "@/lib/island/bus";
import { fakeClock } from "@/lib/island/test-clock";
import { ISLAND_DEFAULTS, type IslandConfig } from "@/lib/island/config";
import type { IslandItem } from "@/lib/island/types";
import { GeneralProvider } from "@/hooks/use-general";
import { GENERAL_DEFAULTS } from "@/lib/general";
import { DynamicIsland } from "./dynamic-island";
import { EXPANDED_MAX_SHARE, fitIslandSize, islandBox, islandMode, islandReserve } from "./island-model";

const PAGE = { width: 1920, height: 1080 };

const render = (bus = createIslandBus(), config: Partial<IslandConfig> = {}, motion: "reduce" | "full" = "full") =>
  renderToString(
    <GeneralProvider value={{ ...GENERAL_DEFAULTS, motion, hour12: false, showSeconds: false }}>
      <DynamicIsland config={{ ...ISLAND_DEFAULTS, ...config }} alerts={[]} placement="fixed" page={PAGE} bus={bus} />
    </GeneralProvider>
  );

describe("DynamicIsland", () => {
  it("shows the time when idle", () => {
    const html = render();
    expect(html).toContain('data-island="idle"');
    expect(html).toMatch(/\d{2}:\d{2}/);
  });

  it("renders nothing when idle is hidden and there is nothing to show", () => {
    expect(render(createIslandBus(), { idle: "hidden" })).toBe("");
  });

  it("shows a sensor's label beside the time, a dash before it reports", () => {
    const html = render(createIslandBus(), { idle: "sensor", stats: [{ key: "test.none", label: "GPU" }] });
    expect(html).toContain("GPU");
    expect(html).toContain("–");
  });

  it("opens for a notice with its title, body and role", () => {
    const bus = createIslandBus();
    bus.notify({ source: "t", id: "a", severity: "warning", title: "CPU hot", body: "92 °C" });
    const html = render(bus);
    expect(html).toContain('data-island="expanded"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("CPU hot");
    expect(html).toContain("92 °C");
    expect(html).toContain("island-motion");
  });

  it("shows a notice's image in place of the icon", () => {
    const bus = createIslandBus();
    bus.notify({ source: "t", id: "a", severity: "info", title: "Song", image: "https://example.test/art.png" });
    expect(render(bus)).toContain('src="https://example.test/art.png"');
  });

  it("shows a notice's level as a meter", () => {
    const bus = createIslandBus();
    bus.notify({ source: "VolumeMixer", id: "volume", severity: "info", title: "Volume 45%", progress: 0.45 });
    const html = render(bus);
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="45"');
    expect(html).toContain("width:45%");
  });

  it("shows a live activity beside the time", () => {
    const bus = createIslandBus();
    bus.setActivity({ source: "NowPlaying", id: "track", title: "Song", subtitle: "Artist", progress: 0.5 });
    const html = render(bus);
    expect(html).toContain('data-island="activity"');
    expect(html).toContain("Song");
    expect(html).toContain("Artist");
    expect(html).toContain("width:50%");
  });

  describe("a badge beside an activity", () => {
    const activity = { source: "agents", id: "top", title: "Codex", subtitle: "api", color: "#22c55e" };
    /** A bus whose waiting notice has closed to a badge, with or without the activity. */
    const held = (withActivity: boolean, withBadge = true) => {
      const { clock, advance } = fakeClock();
      const bus = createIslandBus(clock);
      if (withBadge) bus.notify({ source: "agents-waiting", id: "s1", severity: "warning", title: "Codex needs you", ttl: 1000, badge: true });
      if (withActivity) bus.setActivity(activity);
      advance(1000);
      return bus;
    };

    it("shows the time, the activity and the badge, in that order", () => {
      const html = render(held(true));
      expect(html).toContain('data-island="compact"');
      const at = (s: string) => html.indexOf(s);
      expect(at("Codex")).toBeGreaterThan(at(":"));
      expect(at("api")).toBeGreaterThan(at("Codex"));
      expect(at('aria-label="1 active alerts"')).toBeGreaterThan(at("api"));
      expect(html).toContain("background:#22c55e");
    });

    it("lets the activity text shrink while the time and the badge keep their width", () => {
      const html = render(held(true));
      expect(html).toContain('<span class="min-w-0 truncate text-right">');
      expect(html).toContain('<span class="flex shrink-0"><span class="min-w-0 truncate tabular-nums');
      expect(html).toMatch(/<span class="flex shrink-0 items-center[^"]*" aria-label="1 active alerts">/);
      expect(html).toContain("max-w-full");
    });

    it("shows only the badge without an activity", () => {
      const html = render(held(false));
      expect(html).toContain('data-island="compact"');
      expect(html).toContain('aria-label="1 active alerts"');
      expect(html).not.toContain("Codex");
    });

    it("shows only the activity without a badge", () => {
      const html = render(held(true, false));
      expect(html).toContain('data-island="activity"');
      expect(html).toContain("Codex");
      expect(html).not.toContain("active alerts");
    });
  });

  it("pulses a critical notice only with motion", () => {
    const bus = createIslandBus();
    bus.notify({ source: "t", id: "c", severity: "critical", title: "Down" });
    expect(render(bus)).toContain("island-critical");
    const reduced = render(bus, {}, "reduce");
    expect(reduced).not.toContain("island-critical");
    expect(reduced).not.toContain("island-motion");
    expect(reduced).not.toContain("island-enter");
  });

  it("takes the theme's card colour when tinted, else black or the custom colours", () => {
    expect(render(createIslandBus(), { tint: "theme" })).toContain("background:hsl(var(--card))");
    expect(render()).toContain("background:#000000");
    const custom = render(createIslandBus(), { tint: "custom", bgColor: "#123456", fgColor: "#abcdef", opacity: 50 });
    expect(custom).toContain("color-mix(in srgb, #123456 50%, transparent)");
    expect(custom).toContain("color:#abcdef");
    expect(custom).toContain("blur(14px)");
  });
});

const look = (idle: IslandConfig["idle"], more: Partial<IslandConfig> = {}): IslandConfig => ({ ...ISLAND_DEFAULTS, idle, ...more });

describe("DynamicIsland look", () => {
  it("sits on the top edge as a notch with curved corners", () => {
    const html = render(createIslandBus(), { shape: "notch", offsetY: 30 });
    expect(html).toContain('style="top:0"');
    expect(html).toContain('data-shape="notch"');
    expect(html).toContain("border-radius:0 0 10px 10px");
    expect(html).toContain("radial-gradient(circle farthest-side at 0% 100%");
  });

  it("shows only a hairline when idle is Line, and the island when something comes", () => {
    expect(render(createIslandBus(), { idle: "line" })).toContain('data-island="line"');
    expect(render(createIslandBus(), { idle: "line" })).not.toMatch(/\d{2}:\d{2}/);
    const bus = createIslandBus();
    bus.notify({ source: "t", id: "a", severity: "info", title: "Hello" });
    expect(render(bus, { idle: "line" })).toContain('data-island="expanded"');
  });

  it("shows each value with its label, a dash before it reports", () => {
    const html = render(createIslandBus(), { idle: "sensor", stats: [{ key: "x.a", label: "CPU" }, { key: "x.b", label: "GPU" }] });
    expect(html).toContain("CPU");
    expect(html).toContain("GPU");
  });

  it("shows a group's count on the open notice", () => {
    const bus = createIslandBus();
    bus.setGrouping(true);
    bus.notify({ source: "Notifications", id: "1", group: "Discord", severity: "info", title: "Ann" });
    bus.notify({ source: "Notifications", id: "2", group: "Discord", severity: "info", title: "Bo" });
    expect(render(bus)).toContain('aria-label="2 notices"');
  });

  it("forces seconds off and applies the font weight", () => {
    const html = render(createIslandBus(), { seconds: "hide", weight: "bold", font: "mono" });
    expect(html).toMatch(/>\d{2}:\d{2}</);
    expect(html).toContain("--island-weight:700");
    expect(html).toContain("monospace");
  });

  it("does not animate with motion off", () => {
    const html = render(createIslandBus(), { motion: "off" });
    expect(html).not.toContain("island-motion");
    expect(html).not.toContain("transition:");
  });
});

describe("island model", () => {
  const empty = { expanded: null, pending: [], activity: null };
  const item: IslandItem = { key: "t:a", source: "t", id: "a", severity: "info", title: "A", onTap: "dismiss", cooldownMs: 0, badge: true, count: 1, firstAt: 0, updatedAt: 0, remaining: 0 };

  it("picks the mode from the snapshot and the idle setting", () => {
    expect(islandMode(empty, "time")).toBe("idle");
    expect(islandMode(empty, "hidden")).toBe("none");
    expect(islandMode({ ...empty, pending: [item] }, "hidden")).toBe("compact");
    expect(islandMode({ ...empty, expanded: item }, "time")).toBe("expanded");
    const activity = { source: "m", id: "t", title: "Song" };
    expect(islandMode({ ...empty, activity }, "hidden")).toBe("activity");
    // A held notice wins over the activity.
    expect(islandMode({ ...empty, pending: [item], activity }, "time")).toBe("compact");
  });

  it("gives a badge beside an activity the activity's width", () => {
    const compact = islandBox("compact", "m", look("time"));
    const both = islandBox("compact", "m", look("time"), true);
    expect(both.width).toBeGreaterThan(compact.width);
    expect(both.width).toBe(islandBox("activity", "m", look("time")).width);
    expect(both.height).toBe(compact.height);
  });

  it("grows from idle to compact to expanded", () => {
    const idle = islandBox("idle", "m", look("time"));
    const compact = islandBox("compact", "m", look("time"));
    const expanded = islandBox("expanded", "m", look("time"));
    expect(compact.width).toBeGreaterThan(idle.width);
    expect(expanded.width).toBeGreaterThan(compact.width);
    expect(expanded.height).toBeGreaterThan(compact.height);
    expect(islandBox("idle", "m", look("time-date")).width).toBeGreaterThan(idle.width);
    expect(islandBox("idle", "m", look("sensor")).width).toBe(islandBox("idle", "m", look("time-date")).width);
    expect(islandBox("activity", "m", look("time")).height).toBe(idle.height);
  });

  it("fits the size to the page: the open island stays within its share of the height", () => {
    expect(fitIslandSize("l", { width: 1920, height: 1080 })).toBe("l");
    expect(fitIslandSize("l", { width: 1920, height: 200 })).toBe("m");
    expect(fitIslandSize("m", { width: 1920, height: 160 })).toBe("s");
    expect(fitIslandSize("l", { width: 320, height: 1080 })).toBe("s");
    expect(fitIslandSize("m", { width: 0, height: 0 })).toBe("m");
    for (const page of [{ width: 1920, height: 550 }, { width: 1024, height: 600 }]) {
      const box = islandBox("expanded", fitIslandSize("l", page), look("time"));
      expect(box.height).toBeLessThanOrEqual(page.height * EXPANDED_MAX_SHARE);
      expect(box.width).toBeLessThan(page.width);
    }
  });

  it("reserves the pill's height below its offset only when asked", () => {
    const island = { ...ISLAND_DEFAULTS, offsetY: 10 };
    expect(islandReserve(island, PAGE)).toBe(0);
    expect(islandReserve({ ...island, reserve: true }, PAGE)).toBe(10 + 36 + 8);
    expect(islandReserve({ ...island, reserve: true, enabled: false }, PAGE)).toBe(0);
    expect(islandReserve(undefined, PAGE)).toBe(0);
  });
});
