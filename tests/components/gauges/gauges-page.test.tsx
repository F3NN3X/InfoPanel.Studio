// @vitest-environment happy-dom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeSession } from "@/lib/gauge-studio/session";
import { DEFAULT_THEME } from "@/lib/theme";
import type { StudioBridge } from "@/components/library/library-actions";
import { STARTERS } from "@/lib/infopanel/gauges/presets";
import { CUSTOM_GAUGE_ID, withGaugeName, type GaugeSource } from "@/lib/gauge-studio/model";
import type { DashboardConfig, Placement } from "@/lib/layout";
import { tableOf } from "@/lib/infopanel/assets/assets";
import { toStored } from "@/lib/infopanel/import/stored";
import { parseProfileXml } from "@/lib/infopanel/parse";
import GaugesPage from "@/components/gauges/gauges-page";

// Only the network edge is replaced: the library list and the item write behind "Save to library".
const saved = vi.hoisted(() => ({
  id: "g1",
  kind: "gauge",
  name: "Saved ring",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  files: [],
  meta: {},
  copies: [],
  data: { vector: undefined as unknown, frames: undefined as unknown, min: 0, max: 100, animationSpeed: 0 },
}));
const library = vi.hoisted(() => ({
  listLibrary: vi.fn(async () => [saved]),
  createLibraryItem: vi.fn(async (body: { name: string }) => ({ id: "new1", kind: "gauge", name: body.name, files: [], copies: [] })),
}));
vi.mock("@/lib/library", async (importOriginal) => ({ ...(await importOriginal<object>()), ...library }));

const bridge = {
  config: { profiles: [], panelPresets: [], stylePresets: [] },
  profile: { id: "p", name: "Main", placements: [] },
  profileId: "p",
  setConfig: vi.fn(),
  updateProfile: vi.fn(),
  selection: [],
  select: vi.fn(),
  toast: vi.fn(),
  addCopy: vi.fn(),
} as unknown as StudioBridge;

/** The studio clears `initial` once the page took it (`onOpened`); this host does the same, so a taken gauge isn't opened again. */
function Host({ b, initial, onOpened }: { b: StudioBridge; initial: GaugeSource | null; onOpened: () => void }) {
  const [taken, setTaken] = useState<GaugeSource | null>(null);
  return (
    <GaugesPage
      bridge={b}
      profileName="Main"
      theme={DEFAULT_THEME}
      initial={initial === taken ? null : initial}
      onOpened={() => {
        setTaken(initial);
        onOpened();
      }}
      onShowCanvas={vi.fn()}
    />
  );
}
const pageOf = (b: StudioBridge, initial: GaugeSource | null, onOpened = vi.fn()) => <Host b={b} initial={initial} onOpened={onOpened} />;
const renderPage = (b: StudioBridge = bridge, initial: GaugeSource | null = null) => render(pageOf(b, initial));

const openNewGauge = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("button", { name: /new gauge/i }));
  return screen.findByRole("textbox", { name: "Gauge name" });
};

/** A part switch the editor lets you flip (the always-on ones are disabled). */
const flippable = () => within(screen.getByRole("navigation", { name: "Parts" })).getAllByRole("switch").filter((s) => !(s as HTMLButtonElement).disabled);

beforeEach(() => {
  saved.data.vector = STARTERS[0].gauge;
  saved.data.frames = undefined;
  closeSession();
  library.createLibraryItem.mockClear();
});

describe("Gauges page", () => {

  describe("leaving with unsaved changes", () => {
    const dirtyAndLeave = async () => {
      const user = userEvent.setup({ delay: null });
      renderPage();
      await openNewGauge(user);
      await user.click(flippable()[0]);
      await user.click(screen.getByRole("button", { name: "Back to Gauges" }));
      const dialog = await screen.findByRole("dialog");
      return { user, dialog };
    };

    it("Cancel stays in the editor", async () => {
      const { user, dialog } = await dirtyAndLeave();
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByRole("textbox", { name: "Gauge name" })).toBeTruthy();
    });

    it("Discard goes back to the list without saving", async () => {
      const { user, dialog } = await dirtyAndLeave();
      await user.click(within(dialog).getByRole("button", { name: "Discard" }));
      expect(screen.queryByRole("textbox", { name: "Gauge name" })).toBeNull();
      expect(screen.getByRole("tab", { name: "Gauges", selected: true })).toBeTruthy();
      expect(library.createLibraryItem).not.toHaveBeenCalled();
    });

    it("Save to library writes the item, then goes back", async () => {
      const { user, dialog } = await dirtyAndLeave();
      await user.click(within(dialog).getByRole("button", { name: "Save to library" }));
      await act(async () => {});
      expect(library.createLibraryItem).toHaveBeenCalledWith(expect.objectContaining({ kind: "gauge", name: "New gauge" }));
      expect(screen.queryByRole("textbox", { name: "Gauge name" })).toBeNull();
    });
  });

  describe("Add to canvas for an image sequence", () => {
    const profile = parseProfileXml("<Profile><Name>P</Name><Width>800</Width><Height>400</Height></Profile>").profile;
    const canvas = toStored({ name: "Rig", origin: "file", dataApi: null, defaultMode: "infopanel", profile, items: [], fonts: [], assets: tableOf([]), keyOf: () => null });
    const zone = { id: "z1", module: "infopanel", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, canvas } as Placement;
    const withZones = (placements: Placement[]) => {
      const config = { profiles: [{ id: "p", pages: [{ id: "pg", placements }] }], panelPresets: [], stylePresets: [] } as unknown as DashboardConfig;
      return { ...bridge, config, profile: { id: "p", name: "Main", pageId: "pg", placements }, setConfig: vi.fn() } as unknown as StudioBridge;
    };
    const openSequence = async (b: StudioBridge) => {
      const user = userEvent.setup({ delay: null });
      saved.data.vector = undefined;
      saved.data.frames = [{ id: `${"a".repeat(64)}.png`, name: "1.png" }, { id: `${"b".repeat(64)}.png`, name: "2.png" }];
      renderPage(b);
      const mine = await screen.findByRole("region", { name: "My library" });
      await user.click(await within(mine).findByRole("button", { name: /Saved ring/ }));
      const details = await screen.findByRole("complementary", { name: "Gauge details" });
      return { user, add: within(details).getByRole("button", { name: "Add to canvas" }) as HTMLButtonElement, details };
    };

    it("lists the page's canvas zones and inserts the sequence into the one picked", async () => {
      const b = withZones([zone]);
      const { user, add, details } = await openSequence(b);
      expect(add.disabled).toBe(false);
      await user.click(add);
      await user.click(within(within(details).getByRole("group", { name: "Canvas zones" })).getByRole("button", { name: "Rig" }));
      await act(async () => {});
      expect(b.setConfig).toHaveBeenCalledTimes(1);
      const next = (b.setConfig as ReturnType<typeof vi.fn>).mock.calls[0][0](b.config) as DashboardConfig;
      const stored = next.profiles[0].pages[0].placements[0].canvas!;
      expect(stored.assets.map((a) => a.name)).toEqual(["1.png", "2.png"]);
    });

  });

  describe("renaming a profile gauge", () => {
    const widget: Placement = { id: "w1", module: CUSTOM_GAUGE_ID, colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, settings: { label: "CPU" } };
    const config = { profiles: [{ id: "p", name: "Main", pages: [{ id: "pg", placements: [widget] }] }] } as unknown as DashboardConfig;
    const profileBridge = { ...bridge, profile: { id: "p", name: "Main", placements: [widget] }, setConfig: vi.fn() } as unknown as StudioBridge;

    it("is editable in the header and writes the widget's label through the config", async () => {
      const user = userEvent.setup({ delay: null });
      renderPage(profileBridge, { kind: "widget", zoneId: "w1" });
      const name = (await screen.findByRole("textbox", { name: "Gauge name" })) as HTMLInputElement;
      expect(name.disabled).toBe(false);
      expect(name.value).toBe("CPU");
      await user.type(name, "!");
      const update = vi.mocked(profileBridge.setConfig).mock.calls.at(-1)![0] as (c: DashboardConfig) => DashboardConfig;
      expect(update(config).profiles[0].pages[0].placements[0].settings?.label).toBe("CPU!");
      expect(withGaugeName(config, { kind: "preset", index: 0 }, "x")).toBeNull();
    });

  });

  describe("Edit gauge… over a working copy", () => {
    const edited = async () => {
      const user = userEvent.setup({ delay: null });
      const onOpened = vi.fn();
      const view = render(pageOf(bridge, null, onOpened));
      await openNewGauge(user);
      await user.click(flippable()[0]);
      view.rerender(pageOf(bridge, { kind: "preset", index: 0 }, onOpened));
      return { user, dialog: await screen.findByRole("dialog"), onOpened };
    };
    // A modal hides the page from the accessibility tree while it is open.
    const nameNow = () => (screen.getByRole("textbox", { name: "Gauge name", hidden: true }) as HTMLInputElement).value;

    it("Save to library saves the working copy, then opens the requested gauge", async () => {
      const { user, dialog } = await edited();
      await user.click(within(dialog).getByRole("button", { name: "Save to library" }));
      await act(async () => {});
      expect(library.createLibraryItem).toHaveBeenCalledWith(expect.objectContaining({ name: "New gauge" }));
      await waitFor(() => expect(nameNow()).toContain("copy"));
    });
  });

});
