// @vitest-environment happy-dom
// The rail after the one editor (SPEC §4.1, acceptance 3): Screens and Edit, then the other views; the old InfoPanel
// view is a route alias that lands on Screens' InfoPanel filter, or opens a named profile in Edit.
import { act, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { LeftRail } from "@/components/studio/left-rail";
import { PhoneTabBar } from "@/components/studio/phone-tab-bar";
import { useStudioUi } from "@/components/studio/use-studio-ui";
import { studioHelpTarget } from "@/help/context";
import type { DashboardConfig, ProfileView } from "@/lib/layout";

const profile = { id: "p1", name: "Desk", width: 800, height: 480, cols: 2, rows: 1, fit: "fill", pages: [{ id: "pg", name: "Page 1", placements: [] }], pageId: "pg", placements: [] } as unknown as ProfileView;
const config = { profiles: [profile] } as unknown as DashboardConfig;
const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;
const useUi = () => useStudioUi(config, profile, async () => true, 1600);

describe("the rail", () => {
  it("lists Screens and Edit, then the other views, with no InfoPanel item", () => {
    render(<LeftRail active="design" onSelect={vi.fn()} onHelp={vi.fn()} narrow={false} />);
    const labels = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual(["Screens", "Edit", "Theme", "Library", "Gauges", "Alerts & Island", "Data", "Help", "Settings"]);
  });

  it("has Edit on the phone's bar too", () => {
    render(<PhoneTabBar active="design" onSelect={vi.fn()} onHelp={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "InfoPanel" })).toBeNull();
  });
});

describe("the infopanel route alias", () => {
  it("opens Screens on the InfoPanel filter when no profile is named, from a link or the old rail item", () => {
    const { result } = renderHook(useUi, { wrapper });
    act(() => result.current.navigateTo({ view: "infopanel" }));
    expect(result.current.mode).toBe("screens");
    expect(result.current.screensFilter).toMatchObject({ filter: "infopanel", seq: 1 });
    act(() => result.current.setMode("design"));
    act(() => result.current.onRail("infopanel"));
    expect(result.current.mode).toBe("screens");
    expect(result.current.screensFilter?.seq).toBe(2);
    expect(result.current.editRequest).toBeUndefined();
  });

  it("opens Edit on a named profile", () => {
    const { result } = renderHook(useUi, { wrapper });
    act(() => result.current.navigateTo({ view: "infopanel", profileId: "p1" }));
    expect(result.current.mode).toBe("design");
    expect(result.current.editRequest).toMatchObject({ id: "p1", seq: 1 });
    expect(result.current.screensFilter).toBeUndefined();
  });

  it("keeps Help's InfoPanel editor article for Edit with a canvas open", () => {
    expect(studioHelpTarget({ dialog: null, view: "infopanel", zone: null })).toEqual({ article: "infopanel-editor" });
    expect(studioHelpTarget({ dialog: null, view: "design", zone: null })).toEqual({ article: "studio" });
  });
});
