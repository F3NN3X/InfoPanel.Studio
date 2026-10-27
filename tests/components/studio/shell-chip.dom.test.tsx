// @vitest-environment happy-dom
// The kiosk chip in the status bar opens Live; the breadcrumb's dropdown carries Screen settings…
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScreenSwitcher } from "@/components/studio/screen-switcher";
import { StatusBar } from "@/components/studio/status-bar";
import type { MonitorProfile } from "@/lib/layout";

const bar = {
  dataApi: { state: "connected" as const, base: "http://localhost:3922" },
  server: { kind: "browser" as const, host: "localhost" },
  kiosks: 1,
  restartNeeded: false,
  save: "saved" as const,
  onNavigate: vi.fn(),
};

describe("the status bar's kiosk chip", () => {
  it("shows what the kiosks show and opens Live", () => {
    const onOpenLive = vi.fn();
    render(<StatusBar {...bar} kioskChip="Kiosks show Main · rotation paused" onOpenLive={onOpenLive} />);
    fireEvent.click(screen.getByRole("button", { name: "Kiosks show Main · rotation paused" }));
    expect(onOpenLive).toHaveBeenCalledTimes(1);
  });

  it("is absent outside Edit", () => {
    render(<StatusBar {...bar} onOpenLive={vi.fn()} />);
    expect(screen.queryByText(/Kiosks show/)).toBeNull();
  });
});

describe("the breadcrumb dropdown", () => {
  const profile = { id: "p1", name: "Desk", width: 800, height: 480, pages: [{ id: "pg", name: "Page 1", placements: [] }] } as unknown as MonitorProfile;

  it("opens Screen settings…", () => {
    const onScreenSettings = vi.fn();
    render(<ScreenSwitcher profiles={[profile]} profile={profile} pageId="pg" onSelect={vi.fn()} onManage={vi.fn()} onScreenSettings={onScreenSettings} />);
    fireEvent.click(screen.getByTitle("Switch screen or page"));
    fireEvent.click(screen.getByRole("button", { name: "Screen settings…" }));
    expect(onScreenSettings).toHaveBeenCalledTimes(1);
  });
});
