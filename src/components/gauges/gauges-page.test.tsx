// @vitest-environment happy-dom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setViewport } from "@/test/dom-setup";
import { closeSession } from "@/lib/gauge-studio/session";
import { DEFAULT_THEME } from "@/lib/theme";
import type { StudioBridge } from "@/components/library/library-actions";
import { STARTERS } from "@/lib/infopanel/gauges/presets";
import { CUSTOM_GAUGE_ID, presetGauges, withGaugeName, type GaugeSource } from "@/lib/gauge-studio/model";
import type { DashboardConfig, Placement } from "@/lib/layout";
import GaugesPage from "./gauges-page";

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
  it("opens a new gauge in the editor, unsaved from the start", async () => {
    const user = userEvent.setup();
    renderPage();
    const name = await openNewGauge(user);
    expect((name as HTMLInputElement).value).toBe("New gauge");
    expect(screen.getByRole("tab", { name: "Editor", selected: true })).toBeTruthy();
    expect(screen.getByText(/unsaved/)).toBeTruthy();
  });

  it("opens a library gauge and goes back without asking when nothing changed", async () => {
    const user = userEvent.setup();
    renderPage();
    const mine = await screen.findByRole("region", { name: "My library" });
    await user.dblClick(await within(mine).findByRole("button", { name: /Saved ring/ }));
    expect((screen.getByRole("textbox", { name: "Gauge name" }) as HTMLInputElement).value).toBe("Saved ring");

    await user.click(screen.getByRole("button", { name: "Back to Gauges" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("tab", { name: "Gauges", selected: true })).toBeTruthy();
  });

  it("opens a preset by double-click as its own copy", async () => {
    const user = userEvent.setup();
    renderPage();
    const presets = await screen.findByRole("region", { name: "Presets" });
    const [first] = within(presets).getAllByRole("button");
    const preset = first.textContent;
    await user.dblClick(first);
    expect((screen.getByRole("textbox", { name: "Gauge name" }) as HTMLInputElement).value).toBe(`${preset} copy`);
  });

  it("toggling a part on and off flips the switch back and forth", async () => {
    const user = userEvent.setup();
    renderPage();
    await openNewGauge(user);
    const [sw] = flippable();
    const was = sw.getAttribute("aria-checked");
    await user.click(sw);
    const label = sw.getAttribute("aria-label")!;
    expect(screen.getByRole("switch", { name: label }).getAttribute("aria-checked")).toBe(was === "true" ? "false" : "true");

    await user.click(screen.getByRole("switch", { name: label }));
    expect(screen.getByRole("switch", { name: label }).getAttribute("aria-checked")).toBe(was);
  });

  describe("leaving with unsaved changes", () => {
    const dirtyAndLeave = async () => {
      const user = userEvent.setup();
      renderPage();
      await openNewGauge(user);
      await user.click(flippable()[0]);
      await user.click(screen.getByRole("button", { name: "Back to Gauges" }));
      const dialog = await screen.findByRole("dialog");
      return { user, dialog };
    };

    it("asks with Cancel, Discard and Save to library", async () => {
      const { dialog } = await dirtyAndLeave();
      expect(within(dialog).getByText("Unsaved changes")).toBeTruthy();
      for (const name of ["Cancel", "Discard", "Save to library"]) expect(within(dialog).getByRole("button", { name })).toBeTruthy();
    });

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

  it("offers frames import in the header and a frames-zip export for an image sequence", async () => {
    const user = userEvent.setup();
    saved.data.vector = undefined;
    saved.data.frames = [{ id: `${"a".repeat(64)}.png`, name: "1.png" }, { id: `${"b".repeat(64)}.png`, name: "2.png" }];
    renderPage();
    expect(await screen.findByRole("button", { name: /Import frames/ })).toBeTruthy();
    expect(document.querySelector('input[aria-label="Import frames zip"]')).toBeTruthy();

    const mine = await screen.findByRole("region", { name: "My library" });
    await user.click(await within(mine).findByRole("button", { name: /Saved ring/ }));
    const exportButton = within(await screen.findByRole("complementary", { name: "Gauge details" })).getByRole("button", { name: "Export" }) as HTMLButtonElement;
    expect(exportButton.disabled).toBe(false);
    expect(exportButton.title).toContain(".gauge-frames.zip");
  });

  it("shows the gauge details beside the list when wide and as a sheet when narrow", async () => {
    const user = userEvent.setup();
    renderPage();
    const card = within(await screen.findByRole("region", { name: "Presets" })).getAllByRole("button")[0];
    await user.click(card);
    expect(screen.queryByRole("region", { name: "Gauge details" })).toBeNull();

    act(() => setViewport(600));
    expect(await screen.findByRole("region", { name: "Gauge details" })).toBeTruthy();
  });

  it("shows the library as the gauge's place in the header", async () => {
    const user = userEvent.setup();
    renderPage();
    const mine = await screen.findByRole("region", { name: "My library" });
    await user.dblClick(await within(mine).findByRole("button", { name: /Saved ring/ }));
    expect(screen.getByText(/Vector · My library/)).toBeTruthy();
  });

  it("gives an SVG template gauge a Scale part whose fields change the spec", async () => {
    const user = userEvent.setup();
    const svg = presetGauges().findIndex((e) => e.gauge?.shape === "svg");
    renderPage(bridge, { kind: "preset", index: svg });
    const parts = await screen.findByRole("navigation", { name: "Parts" });
    await user.click(within(parts).getByRole("button", { name: "Scale" }));
    const max = await screen.findByLabelText("Scale max");
    expect((max as HTMLInputElement).value).toBe("100");
    await user.tripleClick(max);
    await user.keyboard("250");
    await user.tab();
    expect((screen.getByLabelText("Scale max") as HTMLInputElement).value).toBe("250");
    expect(screen.getByText(/unsaved/)).toBeTruthy();
  });

  describe("renaming a profile gauge", () => {
    const widget: Placement = { id: "w1", module: CUSTOM_GAUGE_ID, colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, settings: { label: "CPU" } };
    const config = { profiles: [{ id: "p", name: "Main", pages: [{ id: "pg", placements: [widget] }] }] } as unknown as DashboardConfig;
    const profileBridge = { ...bridge, profile: { id: "p", name: "Main", placements: [widget] }, setConfig: vi.fn() } as unknown as StudioBridge;

    it("is editable in the header and writes the widget's label through the config", async () => {
      const user = userEvent.setup();
      renderPage(profileBridge, { kind: "widget", zoneId: "w1" });
      const name = (await screen.findByRole("textbox", { name: "Gauge name" })) as HTMLInputElement;
      expect(name.disabled).toBe(false);
      expect(name.value).toBe("CPU");
      await user.type(name, "!");
      const update = vi.mocked(profileBridge.setConfig).mock.calls.at(-1)![0] as (c: DashboardConfig) => DashboardConfig;
      expect(update(config).profiles[0].pages[0].placements[0].settings?.label).toBe("CPU!");
      expect(withGaugeName(config, { kind: "preset", index: 0 }, "x")).toBeNull();
    });

    it("can be cleared and retyped without the read-back name snapping in", async () => {
      const user = userEvent.setup();
      renderPage(profileBridge, { kind: "widget", zoneId: "w1" });
      const name = (await screen.findByRole("textbox", { name: "Gauge name" })) as HTMLInputElement;
      await user.clear(name);
      expect(name.value).toBe("");
      await user.type(name, "GPU");
      expect(name.value).toBe("GPU");
      const update = vi.mocked(profileBridge.setConfig).mock.calls.at(-1)![0] as (c: DashboardConfig) => DashboardConfig;
      expect(update(config).profiles[0].pages[0].placements[0].settings?.label).toBe("GPU");
    });
  });

  describe("Edit gauge… over a working copy", () => {
    const edited = async () => {
      const user = userEvent.setup();
      const onOpened = vi.fn();
      const view = render(pageOf(bridge, null, onOpened));
      await openNewGauge(user);
      await user.click(flippable()[0]);
      view.rerender(pageOf(bridge, { kind: "preset", index: 0 }, onOpened));
      return { user, dialog: await screen.findByRole("dialog"), onOpened };
    };
    // A modal hides the page from the accessibility tree while it is open.
    const nameNow = () => (screen.getByRole("textbox", { name: "Gauge name", hidden: true }) as HTMLInputElement).value;

    it("asks first, and Cancel keeps the working copy", async () => {
      const { user, dialog } = await edited();
      expect(nameNow()).toBe("New gauge");
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(nameNow()).toBe("New gauge");
    });

    it("Discard opens the requested gauge without saving", async () => {
      const { user, dialog } = await edited();
      await user.click(within(dialog).getByRole("button", { name: "Discard" }));
      expect(nameNow()).toContain("copy");
      expect(library.createLibraryItem).not.toHaveBeenCalled();
    });

    it("Save to library saves the working copy, then opens the requested gauge", async () => {
      const { user, dialog } = await edited();
      await user.click(within(dialog).getByRole("button", { name: "Save to library" }));
      await act(async () => {});
      expect(library.createLibraryItem).toHaveBeenCalledWith(expect.objectContaining({ name: "New gauge" }));
      await waitFor(() => expect(nameNow()).toContain("copy"));
    });
  });

  describe("filmstrip keys", () => {
    const frameIds = ["a", "b", "c"].map((c) => `${c.repeat(64)}.png`);
    const openStrip = async () => {
      const user = userEvent.setup();
      saved.data.vector = undefined;
      saved.data.frames = frameIds.map((id, i) => ({ id, name: `${i + 1}.png` }));
      renderPage();
      const mine = await screen.findByRole("region", { name: "My library" });
      await user.dblClick(await within(mine).findByRole("button", { name: /Saved ring/ }));
      await screen.findByRole("region", { name: "Frames" });
      const pressed = () => within(screen.getByRole("region", { name: "Frames" })).getAllByRole("button", { pressed: true }).map((b) => b.title.split(":")[0]);
      const order = () => [...document.querySelectorAll('section[aria-label="Frames"] img')].map((i) => /([abc])\1{63}/.exec(i.getAttribute("src")!)![1]);
      return { user, pressed, order };
    };

    it("Left and Right select the previous and next frame", async () => {
      const { user, pressed } = await openStrip();
      expect(pressed()).toEqual(["Frame 1"]);
      await user.keyboard("{ArrowRight}");
      expect(pressed()).toEqual(["Frame 2"]);
      await user.keyboard("{ArrowRight}{ArrowRight}");
      expect(pressed()).toEqual(["Frame 3"]);
      await user.keyboard("{ArrowLeft}");
      expect(pressed()).toEqual(["Frame 2"]);
    });

    it("Shift+Left and Shift+Right move the selected frame", async () => {
      const { user, pressed, order } = await openStrip();
      await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
      await act(async () => {});
      expect(order()).toEqual(["b", "a", "c"]);
      expect(pressed()).toEqual(["Frame 2"]);
      await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
      await act(async () => {});
      expect(order()).toEqual(["a", "b", "c"]);
    });

    it("Delete and Backspace remove the selected frame", async () => {
      const { user, order } = await openStrip();
      await user.keyboard("{Delete}");
      await act(async () => {});
      expect(order()).toEqual(["b", "c"]);
      await user.keyboard("{Backspace}");
      await act(async () => {});
      expect(order()).toEqual(["c"]);
    });

    it("leaves the keys to a text field", async () => {
      const { user, pressed, order } = await openStrip();
      await user.click(screen.getByRole("textbox", { name: "Gauge name" }));
      await user.keyboard("{ArrowRight}{Delete}");
      expect(pressed()).toEqual(["Frame 1"]);
      expect(order()).toEqual(["a", "b", "c"]);
    });
  });
});
