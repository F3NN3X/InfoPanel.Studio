// @vitest-environment happy-dom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setViewport } from "@/test/dom-setup";
import { closeSession } from "@/lib/gauge-studio/session";
import { DEFAULT_THEME } from "@/lib/theme";
import type { StudioBridge } from "@/components/library/library-actions";
import { STARTERS } from "@/lib/infopanel/gauges/presets";
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

const renderPage = () =>
  render(<GaugesPage bridge={bridge} profileName="Main" theme={DEFAULT_THEME} initial={null} onOpened={vi.fn()} onShowCanvas={vi.fn()} />);

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
});
