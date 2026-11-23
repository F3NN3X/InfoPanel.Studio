// @vitest-environment happy-dom
// The sidebar's behaviour: the user's collapse choice in a local flag, the same on every page (Q18), the rail under 960 px (Q6), Help and shortcuts (Q5),
// the attention rows (Q3), and the Data API card: its three states, and the address written through the one setter (G1).
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveControl } from "@/components/studio/live-popover";
import StudioSidebar, { SIDEBAR_KEY } from "@/components/studio/sidebar/studio-sidebar";
import { ToastProvider } from "@/components/ui/toast-provider";
import * as desktop from "@/lib/desktop";
import type { DashboardConfig } from "@/lib/layout";
import { sidebarStatus } from "./status";

const config = { dataApiUrl: "http://127.0.0.1:3921", profiles: [] } as unknown as DashboardConfig;

function Held(props: Omit<ComponentProps<typeof StudioSidebar>, "dataApiOpen" | "onDataApiOpenChange">) {
  const [open, setOpen] = useState(false);
  return <StudioSidebar {...props} dataApiOpen={open} onDataApiOpenChange={setOpen} />;
}

function renderSidebar(props: Partial<ComponentProps<typeof StudioSidebar>> = {}) {
  const all = {
    active: "screens" as const,
    onSelect: vi.fn(),
    screenName: "Desk",
    alerts: 0,
    windowWidth: 1600,
    status: sidebarStatus(),
    config,
    onAddress: vi.fn(),
    onNavigate: vi.fn(),
    onHelp: vi.fn(),
    onShortcuts: vi.fn(),
    onPalette: vi.fn(),
    ...props,
  };
  // The studio holds the popover's open state (the palette opens it too).
  const held = (over: Partial<ComponentProps<typeof StudioSidebar>> = {}) => <ToastProvider><Held {...all} {...over} /></ToastProvider>;
  return { ...all, held, ...render(held()) };
}

const width = () => screen.getByRole("complementary", { name: "Studio sidebar" }).className;

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("collapse", () => {
  it("opens expanded, and Edit's old rail flag from earlier builds neither collapses it nor is removed", () => {
    localStorage.setItem("studio.sidebar.editor", "1");
    renderSidebar();
    expect(width()).toContain("w-58");
    expect(localStorage.getItem("studio.sidebar.editor")).toBe("1");
  });

  it("remembers the user's choice in one local flag, for every page", () => {
    const { unmount } = renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe("1");
    unmount();
    renderSidebar({ active: "design" });
    expect(width()).toContain("w-15");
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe("0");
  });

  it("keeps keyboard focus when the sidebar flips between expanded and the rail", () => {
    const { rerender, held } = renderSidebar();
    const row = screen.getByRole("button", { name: "Screens" });
    row.focus();
    expect(document.activeElement).toBe(row);
    rerender(held({ windowWidth: 900 }));
    expect(width()).toContain("w-15");
    expect(screen.getByRole("button", { name: "Screens" })).toBe(row);
    expect(document.activeElement).toBe(row);
  });

  it("stays a rail below 960 px, with no toggle and without touching the flag", () => {
    localStorage.setItem(SIDEBAR_KEY, "0");
    renderSidebar({ windowWidth: 900 });
    expect(width()).toContain("w-15");
    expect(screen.queryByRole("button", { name: /sidebar/ })).toBeNull();
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe("0");
  });
});

describe("the frame", () => {
  it("scrolls rather than clips, so a short window still reaches the Data API card (M5)", () => {
    renderSidebar();
    expect(screen.getByRole("complementary", { name: "Studio sidebar" }).className).toContain("overflow-y-auto");
    // the nav keeps its height, or it would take the shortfall and its rows would paint over the footer with nothing to scroll
    expect(screen.getByRole("navigation", { name: "Studio views" }).className).toContain("shrink-0");
  });

  it("drags the window by its header under Tauri on every page, and nowhere else", () => {
    const tauri = vi.spyOn(desktop, "isTauri").mockReturnValue(true);
    const header = () => document.querySelector("[data-tauri-drag-region]");
    renderSidebar();
    expect(header()).not.toBeNull();
    tauri.mockReturnValue(false);
  });
});

describe("the views", () => {
  it("routes Edit to the editor", () => {
    const { onSelect } = renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Edit Desk" }));
    expect(onSelect).toHaveBeenCalledWith("design");
  });

  it("counts firing alerts on the rail item's name too", () => {
    renderSidebar({ alerts: 2 });
    expect(screen.getByRole("button", { name: "Alerts & Island, 2 active" })).toBeTruthy();
  });

  it("offers Help, the shortcut sheet, the palette and Settings", async () => {
    const { onHelp, onShortcuts, onPalette, onSelect } = renderSidebar();
    const pick = async (name: string) => {
      fireEvent.click(screen.getByRole("button", { name: "Help and shortcuts" }));
      fireEvent.click(await screen.findByRole("menuitem", { name: new RegExp(`^${name}`) }));
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    };
    await pick("Help");
    await pick("Keyboard shortcuts");
    await pick("Search or run a command");
    await pick("Settings");
    expect(onHelp).toHaveBeenCalledTimes(1);
    expect(onShortcuts).toHaveBeenCalledTimes(1);
    expect(onPalette).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("settings");
  });
});

describe("the Live control", () => {
  it("has a tooltip on the rail, like every other collapsed item", async () => {
    renderSidebar({
      windowWidth: 900,
      live: (rail, tip) => <LiveControl open={false} onOpenChange={() => {}} profiles={[]} screen={{ id: "p", name: "Desk", pages: [] } as never} control={null} kiosks={[]} onOpenKioskView={() => {}} place={rail ? "rail" : "sidebar"} tip={tip} />,
    });
    fireEvent.focus(screen.getByRole("button", { name: "Live control, 0 kiosks" }));
    expect(await screen.findByText("Live control, 0 kiosks")).toBeTruthy();
  });
});

describe("the attention rows", () => {
  it("shows nothing when all is well", () => {
    renderSidebar();
    expect(screen.queryByRole("button", { name: /Restart|Update|Offline/ })).toBeNull();
  });

  it("carries the footer's items to their homes", () => {
    const { onNavigate } = renderSidebar({ status: sidebarStatus({}, { server: { kind: "desktop", port: 47911, phase: "restarting" }, update: "1.4.0", restartNeeded: true, save: "offline" }) });
    fireEvent.click(screen.getByRole("button", { name: "Update 1.4.0 available" }));
    expect(onNavigate).toHaveBeenLastCalledWith({ view: "settings", tab: "app", section: "updates" });
    fireEvent.click(screen.getByRole("button", { name: "Restart server to apply" }));
    expect(onNavigate).toHaveBeenLastCalledWith({ view: "settings", tab: "app", section: "server" });
    expect(screen.getByRole("button", { name: "Server · restarting" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Offline · edits kept locally" })).toBeTruthy();
  });
});

describe("the Data API card", () => {
  it.each([
    [{ link: "connected" as const }, "Data API: Connected · 2 ms"],
    [{ link: "reconnecting" as const, downMs: 3000 }, "Data API: Reconnecting · 3 s"],
    [{ link: "offline" as const, downMs: 120_000 }, "Data API: Offline · 2 min"],
  ])("names its state: %j", (health, name) => {
    renderSidebar({ status: sidebarStatus(health) });
    expect(screen.getByRole("button", { name })).toBeTruthy();
  });

  it("offers Retry when offline and Test connection otherwise", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    renderSidebar({ status: sidebarStatus({ link: "offline", downMs: 120_000 }) });
    fireEvent.click(screen.getByRole("button", { name: /^Data API/ }));
    expect(await screen.findByRole("button", { name: "Retry now" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Test connection" })).toBeNull();
    vi.unstubAllGlobals();
  });

  it("writes a valid address through onAddress once, normalized, and refuses an invalid one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const { onAddress } = renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: /^Data API/ }));
    const field = (await screen.findByLabelText("Data API URL")) as HTMLInputElement;
    fireEvent.change(field, { target: { value: "ftp://nope" } });
    act(() => field.blur());
    fireEvent.blur(field);
    expect(onAddress).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.change(field, { target: { value: "http://192.168.1.2:3921/" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onAddress).toHaveBeenCalledTimes(1);
    expect(onAddress).toHaveBeenCalledWith("http://192.168.1.2:3921");
    vi.unstubAllGlobals();
  });
});
