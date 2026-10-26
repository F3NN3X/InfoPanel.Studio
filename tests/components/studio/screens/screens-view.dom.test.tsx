// @vitest-environment happy-dom
// Screens lists InfoPanel profiles with Studio screens (one-editor SPEC §4.2, acceptance 4): an InfoPanel tag, the
// All · Studio · InfoPanel filter, Import .infopanel, a link's filter, and Rename carrying the name into the canvas.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { newStored } from "@/lib/infopanel/import/stored";
import { CANVAS_ID, type DashboardConfig, type Placement } from "@/lib/layout";

const doors = vi.hoisted(() => ({ openImportDoor: vi.fn(), openExportSheet: vi.fn(), openConvertDialog: vi.fn() }));
vi.mock("@/components/studio/file-doors", async (importOriginal) => ({ ...(await importOriginal<object>()), ...doors }));
vi.mock("@/components/studio/screen-detail", () => ({ ScreenDetail: () => null }));
vi.mock("@/components/studio/screens/screen-thumb", () => ({ ScreenThumb: () => null }));

import { ScreensView } from "@/components/studio/screens-view";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("[]", { status: 200 }))));
});

const canvasZone = { id: "z", module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, canvas: newStored({ name: "Desk", width: 800, height: 480 }) } as Placement;
const desk = { id: "p1", name: "Desk", width: 800, height: 480, cols: 2, rows: 1, fit: "fill", pages: [{ id: "pg", name: "Page 1", placements: [canvasZone] }] };
const main = { id: "p2", name: "Main", width: 1920, height: 1080, cols: 12, rows: 8, fit: "fill", pages: [{ id: "pg2", name: "Page 1", placements: [] }] };
const config = { profiles: [desk, main] } as unknown as DashboardConfig;

function view(over: Record<string, unknown> = {}) {
  const props = {
    config,
    profile: { ...main, pageId: "pg2", placements: [] },
    windowSize: { width: 1600, height: 1000 },
    autoProfileId: "p2",
    kiosks: [],
    displays: [],
    onSelectProfile: vi.fn(),
    onDuplicateProfile: vi.fn(),
    onRemoveProfile: vi.fn(),
    onUndo: vi.fn(),
    onOpenSaved: vi.fn(),
    onNew: vi.fn(),
    updateProfile: vi.fn(),
    setConfig: vi.fn(),
    onRotate: vi.fn(),
    onPerformance: vi.fn(),
    onMovePage: vi.fn(),
    onAddPage: vi.fn(),
    onOpenPage: vi.fn(),
    onOpenLive: vi.fn(),
    navigateTo: vi.fn(),
    onOpenScreen: vi.fn(),
    ...over,
  } as unknown as Parameters<typeof ScreensView>[0];
  render(
    <ToastProvider>
      <ScreensView {...props} />
    </ToastProvider>,
  );
  return props;
}

const cards = () => within(screen.getByRole("list", { name: "Your screens" })).getAllByRole("listitem");
const names = () => cards().map((c) => (c.textContent?.includes("Desk") ? "Desk" : "Main"));

describe("Screens with InfoPanel profiles", () => {
  it("tags an InfoPanel profile, and the filter shows only them or only Studio screens", () => {
    view();
    const deskCard = cards().find((c) => c.textContent?.includes("Desk"))!;
    expect(within(deskCard).getByTitle(/An InfoPanel profile/).textContent).toBe("InfoPanel");
    expect(names()).toHaveLength(2);
    const show = screen.getByRole("group", { name: "Show" });
    expect(within(show).getAllByRole("button").map((b) => b.textContent)).toEqual(["All", "Studio", "InfoPanel"]);
    fireEvent.click(within(show).getByRole("button", { name: "InfoPanel" }));
    expect(names()).toEqual(["Desk"]);
    fireEvent.click(within(show).getByRole("button", { name: "Studio" }));
    expect(names()).toEqual(["Main"]);
  });

  it("imports an .infopanel through the import flow", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Import .infopanel" }));
    expect(doors.openImportDoor).toHaveBeenCalledWith({ prefer: "canvas-zone" });
  });

  it("opens on the filter a link names", () => {
    view({ filterRequest: { filter: "infopanel", seq: 1 } });
    expect(names()).toEqual(["Desk"]);
  });

  it("renames an InfoPanel screen's canvas with it, in one step", () => {
    const props = view();
    const deskCard = cards().find((c) => c.textContent?.includes("Desk"))!;
    fireEvent.contextMenu(deskCard, { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const field = screen.getByLabelText("Screen name");
    fireEvent.change(field, { target: { value: "Bench" } });
    fireEvent.keyDown(field, { key: "Enter" });
    const setConfig = props.setConfig as unknown as ReturnType<typeof vi.fn>;
    expect(setConfig).toHaveBeenCalledTimes(1);
    const next = setConfig.mock.calls[0][0](config) as DashboardConfig;
    expect(next.profiles[0].name).toBe("Bench");
    expect(next.profiles[0].pages[0].placements[0].canvas?.profile.Name).toBe("Bench");
    expect(next.profiles[1]).toBe(config.profiles[1]);
  });
});
