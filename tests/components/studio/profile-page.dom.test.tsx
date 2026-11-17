// @vitest-environment happy-dom
// Theme's canvas (`ProfilePage`) draws a page as the kiosk does: with its pinned layer. An edge item takes its room off
// the page's padding and draws on its edge; a widget pinned in place draws over the page grid; a page that hides the
// layer draws none of it.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfilePage } from "@/components/studio/profile-page";
import { defaultConfig, type MonitorProfile } from "@/lib/layout";
import type { PinnedEdgeItem, PinnedGridItem } from "@/lib/pinned";

// the widgets' live data and the theme pack are not what is under test
vi.mock("@/components/studio/placement-content", () => ({ LivePlacement: () => null }));

afterEach(cleanup);

const status: PinnedEdgeItem = { id: "pin-status", edge: "top", mode: "room", thickness: 40, show: "all", visible: true, placement: { id: "s", module: "Clock" } } as PinnedEdgeItem;
const inPlace: PinnedGridItem = { id: "pin-here", at: { colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1 }, show: "all", visible: true, placement: { id: "w", module: "Clock" } };

function draw(hidePinned = false) {
  const config = defaultConfig();
  const base = config.profiles[0];
  const profile: MonitorProfile = {
    ...base,
    id: "s",
    cols: 4,
    rows: 3,
    pages: [{ id: "a", name: "A", placements: [], ...(hidePinned ? { hidePinned: true } : {}) }],
    pinned: { items: [status, inPlace] },
  };
  return render(<ProfilePage profile={profile} dashboard={{ ...config, profiles: [profile] }} pageId="a" />).container;
}

describe("the pinned layer on Theme's canvas", () => {
  it("draws the edge item and makes its room, as the kiosk does", async () => {
    const page = draw();
    expect(page.querySelector('[data-pinned-item="pin-status"]')).not.toBeNull();
    const root = page.firstElementChild as HTMLElement;
    expect(Number.parseFloat(root.style.paddingTop) - Number.parseFloat(root.style.paddingBottom)).toBe(40);
  });

  it("draws a widget pinned in place over the page grid", async () => {
    const page = draw();
    await vi.waitFor(() => expect(page.querySelector('[data-pinned-item="pin-here"]')).not.toBeNull());
  });

  it("draws none of it on a page that hides the layer", () => {
    const page = draw(true);
    expect(page.querySelector("[data-pinned-item]")).toBeNull();
    const root = page.firstElementChild as HTMLElement;
    expect(root.style.paddingTop).toBe(root.style.paddingBottom);
  });
});
