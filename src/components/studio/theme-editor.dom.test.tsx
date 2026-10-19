// @vitest-environment happy-dom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type SetStateAction } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { defaultConfig, type DashboardConfig, type Placement } from "@/lib/layout";
import { ThemeEditor } from "./theme-editor";
import type { ThemeScope } from "./theme-editor-model";

const zone = (id: string, module: string, extra: Partial<Placement> = {}): Placement => ({
  id,
  module,
  colStart: 1,
  rowStart: 1,
  colSpan: 3,
  rowSpan: 2,
  visible: true,
  ...extra,
});

function config(): DashboardConfig {
  const c = defaultConfig();
  return {
    ...c,
    profiles: [
      {
        ...c.profiles[0],
        id: "desk",
        name: "Desk",
        pages: [
          { id: "main", name: "Main", placements: [zone("cpu", "CpuMonitor", { settings: { accent: "#ff0000" }, follow: { colors: false } })] },
          { id: "gaming", name: "Gaming", placements: [] },
        ],
      },
    ],
  };
}

/** The editor over a config kept in state (`latest` reads it; `jump` asks for a section). */
function setup(initial: ThemeScope = { kind: "profile" }) {
  const latest: { config: DashboardConfig; jump: (id: string, key?: string) => void } = { config: config(), jump: () => {} };
  function Host() {
    const [cfg, setCfg] = useState(latest.config);
    const [scope, setScope] = useState<ThemeScope>(initial);
    const [jumpTo, setJumpTo] = useState<{ id: string; key?: string; seq: number }>();
    latest.jump = (id, key) => setJumpTo((j) => ({ id, key, seq: (j?.seq ?? 0) + 1 }));
    latest.config = cfg;
    return (
      <ThemeEditor
        config={cfg}
        profile={cfg.profiles[0]}
        currentPageId="main"
        scope={scope}
        onScope={setScope}
        setConfig={(action: SetStateAction<DashboardConfig>) => setCfg(action)}
        jumpTo={jumpTo}
      />
    );
  }
  render(<Host />);
  return latest;
}

/** The previews' live widgets subscribe to the sensor stream: a silent one. */
class SilentEventSource {
  onmessage: unknown = null;
  onerror: unknown = null;
  onopen: unknown = null;
  readyState = 0;
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

beforeAll(() => {
  vi.stubGlobal("EventSource", SilentEventSource);
});

const inspector = () => within(screen.getByRole("complementary", { name: "Theme inspector" }));
const sectionOf = (title: RegExp) => inspector().getByRole("button", { name: title }).closest("section")!;

/** Pick a tab and open a section of it (the open sections and the tab are remembered across tests). */
async function openSection(tab: string, title: RegExp) {
  await userEvent.click(inspector().getByRole("tab", { name: tab }));
  const head = inspector().getByRole("button", { name: title });
  if (head.getAttribute("aria-expanded") !== "true") await userEvent.click(head);
}

describe("Theme editor", () => {
  it("has no Show tab, and the Style tab lists Status & series colors after Colors", async () => {
    setup();
    const tabs = inspector().getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Style", "Data", "Behaviour"]);
    expect(inspector().getByRole("button", { name: /^Status & series colors/ })).toBeTruthy();
  });

  it("profile: locks a section per section and for all; the bar counts the custom widgets", async () => {
    const latest = setup();
    await openSection("Style", /^Colors/);
    const colors = within(sectionOf(/^Colors/));
    expect(colors.getByText("Default for all widgets · 1 custom on Main")).toBeTruthy();
    await userEvent.click(colors.getByRole("button", { name: "Lock" }));
    expect(latest.config.profiles[0].widgetTheme?.locks).toEqual({ colors: true });
    expect(within(sectionOf(/^Colors/)).getByText("Locked: every widget uses these")).toBeTruthy();
    await userEvent.click(within(sectionOf(/^Colors/)).getByRole("button", { name: "Unlock" }));
    expect(latest.config.profiles[0].widgetTheme).toBeUndefined();

    await userEvent.click(inspector().getByRole("button", { name: "Lock all" }));
    expect(Object.keys(latest.config.profiles[0].widgetTheme?.locks ?? {})).toHaveLength(11);
    expect(inspector().getByRole("button", { name: "Unlock all" })).toBeTruthy();
  });

  it("profile: an edit writes the profile theme's values", async () => {
    const latest = setup();
    await openSection("Data", /^Units & format/);
    const format = within(sectionOf(/^Units & format/));
    await userEvent.click(within(format.getByRole("radiogroup", { name: "Temperature" })).getByRole("radio", { name: "°F" }));
    expect(latest.config.profiles[0].widgetTheme?.values).toEqual({ tempUnit: "f" });
  });

  it("page: Customize makes a section the page's own, Use profile follows again", async () => {
    const latest = setup();
    await userEvent.click(screen.getByRole("button", { name: /^Gaming/ }));
    await openSection("Style", /^Colors/);
    const colors = within(sectionOf(/^Colors/));
    expect(colors.getByText("Follows the profile theme")).toBeTruthy();
    await userEvent.click(colors.getByRole("button", { name: "Customize" }));
    expect(latest.config.profiles[0].pages[1].widgetTheme?.follow).toEqual({ colors: false });
    expect(within(sectionOf(/^Colors/)).getByText("Custom for Gaming")).toBeTruthy();
    await userEvent.click(within(sectionOf(/^Colors/)).getByRole("button", { name: "Use profile" }));
    expect(latest.config.profiles[0].pages[1].widgetTheme).toBeUndefined();
  });

  it("lists who doesn't follow, and Reset to theme makes them follow keeping their own values", async () => {
    const latest = setup();
    const list = within(screen.getByRole("region", { name: "Who doesn't follow the theme" }));
    const colors = list.getByText("Colors").parentElement!;
    expect(within(colors).getByText("CPU Monitor")).toBeTruthy();
    expect(list.getAllByRole("button", { name: "Reset to theme" })).toHaveLength(1);
    await userEvent.click(within(colors).getByRole("button", { name: "Reset to theme" }));
    const cpu = latest.config.profiles[0].pages[0].placements[0];
    expect(cpu.follow).toBeUndefined();
    expect(cpu.settings).toEqual({ accent: "#ff0000" });
    expect(list.queryByRole("button", { name: "Reset to theme" })).toBeNull();
  });

  it("a page scope of a page this profile doesn't have edits the profile theme", async () => {
    const latest = setup({ kind: "page", pageId: "gone" });
    expect(inspector().getByText("Profile theme")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Profile theme/ }).getAttribute("aria-pressed")).toBe("true");
    await openSection("Data", /^Units & format/);
    await userEvent.click(within(within(sectionOf(/^Units & format/)).getByRole("radiogroup", { name: "Temperature" })).getByRole("radio", { name: "°F" }));
    expect(latest.config.profiles[0].widgetTheme?.values).toEqual({ tempUnit: "f" });
  });

  it("a jump (the palette's Go to setting) opens the row's tab and section", async () => {
    const latest = setup();
    await openSection("Style", /^Colors/);
    act(() => latest.jump("thresholds", "warn.load"));
    await waitFor(() => expect(inspector().getByRole("tab", { name: "Behaviour" }).getAttribute("aria-selected")).toBe("true"));
    expect(inspector().getByRole("button", { name: /^Thresholds/ }).getAttribute("aria-expanded")).toBe("true");
  });

  it("previews three widgets with their source chips", () => {
    setup();
    const previews = screen.getByRole("region", { name: "Previews" });
    expect([...previews.querySelectorAll("[data-preview]")].map((p) => p.getAttribute("data-preview"))).toEqual(["CpuMonitor", "Weather", "AudioMeter"]);
    const cpu = previews.querySelector('[data-preview="CpuMonitor"]')!;
    expect(within(cpu as HTMLElement).getByTitle("Colors: Custom")).toBeTruthy();
    expect(within(cpu as HTMLElement).getByTitle("Thresholds: Theme")).toBeTruthy();
  });
});
