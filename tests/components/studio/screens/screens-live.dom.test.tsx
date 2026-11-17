// @vitest-environment happy-dom
// Screens' Displays column (Q9) and the page's own controls: a card per display, online or not, its switcher and page
// cycling acting on the screen, a named display's screen choice, its touch row, Show on from a screen, the settings
// drawer, the search keys and the grid or list toggle.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast-provider";
import type { ControlDisplay, ControlKiosk, ControlState } from "@/lib/control";
import type { DashboardConfig } from "@/lib/layout";

const api = vi.hoisted(() => ({ postControl: vi.fn(async () => null) }));
vi.mock("@/lib/control", async (importOriginal) => ({ ...(await importOriginal<object>()), postControl: api.postControl }));
vi.mock("@/components/studio/screen-detail", () => ({
  ScreenDetail: ({ onClose }: { onClose: () => void }) => (
    <aside>
      <p>Some words in the drawer</p>
      <button onClick={onClose}>detail</button>
      <button>last control</button>
    </aside>
  ),
}));
vi.mock("@/components/studio/screens/screen-thumb", () => ({ ScreenThumb: () => null }));
/** The desktop app's touch state, when a test plays it; a browser studio otherwise. */
const desktop = vi.hoisted(() => ({ on: false, view: null as unknown, openSettings: vi.fn(async () => {}) }));
vi.mock("@/lib/desktop", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isTauri: () => desktop.on,
  touchView: async () => desktop.view ?? undefined,
  touchScreens: async () => [],
  openSettings: desktop.openSettings,
}));

import { ScreensView } from "@/components/studio/screens-view";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("[]", { status: 200 }))));
});
afterEach(() => {
  vi.clearAllMocks();
  desktop.on = false;
  desktop.view = null;
});

const page = (id: string, name: string) => ({ id, name, placements: [] });
const main = { id: "p1", name: "Main", width: 1600, height: 900, cols: 12, rows: 8, fit: "fill", rotate: { enabled: true, seconds: 30 }, pages: [page("a", "Page A"), page("b", "Page B")] };
const desk = { id: "p2", name: "Desk", width: 1920, height: 550, cols: 12, rows: 4, fit: "fill", pages: [page("c", "Only")] };
const config = { profiles: [main, desk] } as unknown as DashboardConfig;

const kiosk = (over: Partial<ControlKiosk>): ControlKiosk => ({ id: "k1", profile: "p1", page: "a", address: "192.168.1.24", since: Date.now() - 2 * 3_600_000, ...over });
const display: ControlDisplay = { name: "wall", screen: "p1", firstSeen: 0, lastSeen: Date.now(), online: true, address: null, shows: "p1" };

/** touch_view with one panel, Left bar (panel-1), in the given state. */
function touchView({ status, port = null }: { status: unknown; port?: string | null }) {
  const entry = { id: "panel-1", name: "Left bar", device: { vid: null, pid: null, port }, monitor: null, panel: { width_px: 1920, height_px: 550, rotation: "0", flip_x: false, flip_y: false, calibration: null } };
  return { enabled: true, file: {}, file_error: null, effective: { panels: [entry] }, defaults: {}, issues: [], panels: [{ id: "panel-1", name: "Left bar", is_virtual: false, status }], path: "" };
}

/** Renders the last `view()` again with other props. */
let again: (over: Record<string, unknown>) => void;

function view(over: Record<string, unknown> = {}) {
  const props = {
    config,
    profile: { ...main, pageId: "a", placements: [] },
    windowSize: { width: 1600, height: 1000 },
    autoProfileId: "p1",
    kiosks: [],
    displays: [],
    control: null,
    onOpenKioskView: vi.fn(),
    onSettingsHandled: vi.fn(),
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
    onOpenScreenPage: vi.fn(),
    ...over,
  } as unknown as Parameters<typeof ScreensView>[0];
  const ui = (p: typeof props) => (
    <ToastProvider>
      <ScreensView {...p} />
    </ToastProvider>
  );
  const { rerender } = render(ui(props));
  again = (next) => rerender(ui({ ...props, ...next } as typeof props));
  return props;
}

const live = () => screen.getByRole("region", { name: "Displays" });

describe("Displays", () => {
  it("still offers the kiosk address when no display is connected", () => {
    view();
    expect(within(live()).getByRole("region", { name: "Add a display" }).textContent).toContain("?kiosk=1");
  });

  it("has a card per kiosk and states only what the server reports", () => {
    view({ kiosks: [kiosk({}), kiosk({ id: "k2", display: "wall", profile: "p2", page: "c" })], displays: [display] });
    const cards = within(live()).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain("Kiosk · 192.168.1.24");
    expect(cards[0].textContent).toContain("Live · connected 2 h");
    expect(cards[1].textContent).toContain("wall");
    expect(live().textContent).not.toMatch(/browser|ethernet|wi-?fi/i);
  });

  it("switches the page of the screen the kiosk shows, and the screen of a named display only", () => {
    view({ kiosks: [kiosk({}), kiosk({ id: "k2", display: "wall" })], displays: [display] });
    fireEvent.change(screen.getAllByLabelText("Page of Main")[0], { target: { value: "b" } });
    expect(api.postControl).toHaveBeenCalledWith("page", { profile: "p1", page: "b" });
    expect(screen.queryByLabelText("Screen for Kiosk · 192.168.1.24")).toBeNull();
    fireEvent.change(screen.getByLabelText("Screen for wall"), { target: { value: "p2" } });
    expect(api.postControl).toHaveBeenCalledWith("display", { action: "assign", display: "wall", screen: "p2" });
  });

  it("pauses the screen's page cycling from the card, and can't on a one-page screen", () => {
    const state = { profiles: { p1: { rotating: true } } } as unknown as ControlState;
    view({ kiosks: [kiosk({}), kiosk({ id: "k2", profile: "p2", page: "c" })], control: state });
    fireEvent.click(screen.getByRole("button", { name: "Cycling pages: every 30 s (Main)" }));
    expect(api.postControl).toHaveBeenCalledWith("rotate", { profile: "p1", state: "off" });
    expect((screen.getByRole("button", { name: "One page (Desk)" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens the screen's settings on Rotation from the card menu, and keeps Forget display for a named one", () => {
    const props = view({ kiosks: [kiosk({ display: "wall" })], displays: [display] });
    fireEvent.click(screen.getByRole("button", { name: "Display actions, wall" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Forget display" }));
    expect(api.postControl).toHaveBeenCalledWith("display", { action: "forget", display: "wall" });
    fireEvent.click(screen.getByRole("button", { name: "Display actions, wall" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Main rotation settings…" }));
    expect(props.navigateTo).toHaveBeenCalledWith({ view: "screens", profileId: "p1", section: "rotation" });
  });

  it("gives an offline named display a card of its own: when it was seen, its screen and Forget in its menu", () => {
    view({ displays: [{ ...display, online: false, lastSeen: Date.now() - 3 * 3_600_000 }] });
    const card = within(live()).getAllByRole("listitem")[0];
    expect(card.textContent).toContain("Offline · seen 3 h ago");
    fireEvent.change(screen.getByLabelText("Screen for wall"), { target: { value: "p2" } });
    expect(api.postControl).toHaveBeenCalledWith("display", { action: "assign", display: "wall", screen: "p2" });
    fireEvent.click(screen.getByRole("button", { name: "Display actions, wall" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Forget display" }));
    expect(api.postControl).toHaveBeenCalledWith("display", { action: "forget", display: "wall" });
  });

  it("calls the kiosk on this PC with no name This PC, and says touch needs the desktop app in a browser", () => {
    view({ kiosks: [kiosk({ address: "127.0.0.1" })] });
    const card = within(live()).getAllByRole("listitem")[0];
    expect(card.textContent).toContain("This PC");
    fireEvent.click(within(card).getByRole("button", { name: "Set up touch" }));
    expect(card.textContent).toContain("Touch panels need the InfoPanel Studio desktop app");
    expect(desktop.openSettings).not.toHaveBeenCalled();
  });

  it("shows a touch panel's display by the panel's name and state, and Set up touch opens the guided setup for it", async () => {
    desktop.on = true;
    desktop.view = touchView({ status: { status: "Disconnected" } });
    view({ kiosks: [kiosk({ address: "127.0.0.1", display: "panel-1" })], displays: [{ ...display, name: "panel-1", address: "127.0.0.1" }] });
    const card = within(live()).getAllByRole("listitem")[0];
    await waitFor(() => expect(card.textContent).toContain("Panel not connected"));
    expect(card.textContent).toContain("Left bar");
    fireEvent.click(within(card).getByRole("button", { name: "Set up touch" }));
    expect(desktop.openSettings).toHaveBeenCalledWith("touch/setup");
    expect(JSON.parse(localStorage.getItem("infopanel.touch-intent") ?? "{}")).toMatchObject({ action: "setup", panel: "panel-1" });
  });

  it("offers Identify, Calibrate… and Remove for a ready panel", async () => {
    desktop.on = true;
    desktop.view = touchView({ status: { status: "Connected", interface: 0, report_len: 64, port: "USB-4.2" }, port: "USB-4.2" });
    view({ kiosks: [kiosk({ address: "127.0.0.1", display: "panel-1" })], displays: [{ ...display, name: "panel-1", address: "127.0.0.1" }] });
    const card = within(live()).getAllByRole("listitem")[0];
    await waitFor(() => expect(card.textContent).toContain("Ready"));
    fireEvent.click(within(card).getByRole("button", { name: "Touch panel actions, Left bar" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Calibrate…" }));
    expect(desktop.openSettings).toHaveBeenCalledWith("touch/calibrate");
  });

  it("counts a named display once however many browser tabs it has open", () => {
    view({ kiosks: [kiosk({ display: "wall" }), kiosk({ id: "k2", display: "wall" }), kiosk({ id: "k3" })], displays: [display] });
    expect(screen.getByText("2 screens · 2 displays live")).toBeTruthy();
    expect(screen.getByText("On 2 displays")).toBeTruthy();
  });

  it("names the screen in the menu labels that act on the screen, not on one display", () => {
    view({ kiosks: [kiosk({})] });
    fireEvent.click(screen.getByRole("button", { name: "Display actions, Kiosk · 192.168.1.24" }));
    for (const name of ["Dim Main", "Show Dynamic Island on Main", "Reload displays showing Main"]) expect(screen.getByRole("menuitem", { name })).toBeTruthy();
  });

  it("counts displays in the header and on the card of the screen they show", () => {
    view({ kiosks: [kiosk({}), kiosk({ id: "k2" })] });
    expect(screen.getByText("2 screens · 2 displays live")).toBeTruthy();
    expect(screen.getByText("On 2 displays")).toBeTruthy();
  });
});

describe("Show on, from a screen", () => {
  const rowOf = (name: string) => screen.getAllByRole("listitem").find((c) => c.textContent?.includes(name) && c.textContent.includes("1920"))!;

  it("puts a screen on a named display from its row's menu", () => {
    localStorage.setItem("screens.list", "1");
    view({ kiosks: [kiosk({ display: "wall" })], displays: [display] });
    fireEvent.contextMenu(rowOf("Desk"), { clientX: 5, clientY: 5 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Show on" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "wall" }));
    expect(api.postControl).toHaveBeenCalledWith("display", { action: "assign", display: "wall", screen: "p2" });
  });

  it("uses a screen on a touch panel: the control override for the panel's kiosk, never its URL", async () => {
    desktop.on = true;
    desktop.view = touchView({ status: { status: "Disconnected" } });
    view({ displays: [{ ...display, name: "panel-1", online: false, screen: "follow", shows: null }] });
    await waitFor(() => expect(within(live()).getAllByRole("listitem")[0].textContent).toContain("Left bar"));
    fireEvent.contextMenu(rowOf("Desk"), { clientX: 5, clientY: 5 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Use on touch panel" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Left bar (touch)" }));
    expect(api.postControl).toHaveBeenCalledWith("display", { action: "assign", display: "panel-1", screen: "p2" });
  });

  it("can't use a touch panel whose kiosk never opened yet", async () => {
    desktop.on = true;
    desktop.view = touchView({ status: { status: "Disconnected" } });
    view({ displays: [display] });
    fireEvent.contextMenu(rowOf("Desk"), { clientX: 5, clientY: 5 });
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Use on touch panel" })).toBeTruthy());
    fireEvent.click(screen.getByRole("menuitem", { name: "Use on touch panel" }));
    expect((screen.getByRole("menuitem", { name: "Left bar (touch)" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("leads from On 1 display to the display's card, and hints Show on for a screen on no display", () => {
    view({ kiosks: [kiosk({ display: "wall" })], displays: [display] });
    fireEvent.click(screen.getByRole("button", { name: "On 1 display" }));
    expect(live().querySelector('[data-display="wall"]')?.className).toContain("border-ui-accent");
    expect(screen.getByText("Not on a display · Show on…")).toBeTruthy();
  });
});

describe("Your screens", () => {
  it("sends / and Ctrl+F to the search", () => {
    view();
    const search = screen.getByRole("searchbox", { name: "Search screens" }) as HTMLInputElement;
    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(search);
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    expect(document.activeElement).toBe(search);
  });

  it("leaves / to a field that is being typed in", () => {
    view();
    const search = screen.getByRole("searchbox", { name: "Search screens" });
    const other = document.createElement("input");
    document.body.append(other);
    other.focus();
    fireEvent.keyDown(other, { key: "/" });
    expect(document.activeElement).toBe(other);
    expect(document.activeElement).not.toBe(search);
    other.remove();
  });

  it("opens a screen by its card and its settings from the menu, and remembers the list layout", () => {
    const props = view();
    fireEvent.click(screen.getByRole("button", { name: "Open Desk" }));
    expect(props.onOpenScreen).toHaveBeenCalledWith("p2");
    const deskCard = screen.getAllByRole("listitem").find((c) => c.textContent?.includes("Desk") && c.textContent.includes("1920"))!;
    fireEvent.contextMenu(deskCard, { clientX: 5, clientY: 5 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Screen settings…" }));
    expect(props.navigateTo).toHaveBeenCalledWith({ view: "screens", profileId: "p2", section: undefined });

    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(localStorage.getItem("screens.list")).toBe("1");
    expect(screen.getByRole("list", { name: "Your screens" }).tagName).toBe("UL");
    expect(screen.queryByText("From a template, a size preset or an .infopanel file")).toBeNull();
  });

  it("opens the settings drawer for a request, once, and Esc closes it", async () => {
    const props = view({ settingsRequest: { id: "p1", seq: 1 } });
    expect(props.onSettingsHandled).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole("dialog", { name: "Screen settings" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Screen settings" })).toBeNull());
  });
});

describe("the settings drawer is a modal dialog", () => {
  const open = () => view({ settingsRequest: { id: "p1", seq: 1 } });

  it("closes on Esc with focus on the body of the drawer, not on a control", async () => {
    open();
    expect(screen.getByRole("dialog", { name: "Screen settings" })).toBeTruthy();
    // A click on its text, then focus on the body: no control has it.
    await userEvent.click(screen.getByText("Some words in the drawer"));
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Screen settings" })).toBeNull());
  });

  it("keeps Tab inside it from the last control, and Shift+Tab from the first", async () => {
    open();
    const dialog = screen.getByRole("dialog", { name: "Screen settings" });
    screen.getByRole("button", { name: "last control" }).focus();
    await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    screen.getByRole("button", { name: "detail" }).focus();
    await userEvent.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("makes the page behind it inert", () => {
    open();
    const behind = screen.getByRole("searchbox", { hidden: true, name: "Search screens" });
    expect(behind.closest("[inert], [aria-hidden='true']")).not.toBeNull();
  });

  it("leaves / and Ctrl+F alone while it is open", async () => {
    open();
    await userEvent.click(screen.getByText("Some words in the drawer"));
    await userEvent.keyboard("/");
    expect(document.activeElement).not.toBe(screen.queryByRole("searchbox", { hidden: true }));
  });

  it("does not come back when the edited screen changes away and back", async () => {
    open();
    expect(screen.getByRole("dialog", { name: "Screen settings" })).toBeTruthy();
    again({ profile: { ...desk, pageId: "c", placements: [] }, settingsRequest: undefined });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Screen settings" })).toBeNull());
    again({ profile: { ...main, pageId: "a", placements: [] }, settingsRequest: undefined });
    expect(screen.queryByRole("dialog", { name: "Screen settings" })).toBeNull();
  });

  it("puts focus back on the screen's card when no menu button opened it", async () => {
    open();
    await userEvent.click(screen.getByRole("button", { name: "detail" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Screen settings" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open Main" })));
  });
});
