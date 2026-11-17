// @vitest-environment happy-dom
// The pin badge on Edit's Page view is drawn at 1/zoom, so its count stays legible however far the canvas is zoomed.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PinnedGridCanvas } from "@/components/studio/pinned/pinned-grid-canvas";
import { defaultConfig, type MonitorProfile } from "@/lib/layout";
import { profileWithPage } from "@/lib/pages";
import type { PinnedGridItem } from "@/lib/pinned";

// the widgets' live data (a sensor stream) is not what is under test
vi.mock("@/components/studio/placement-content", () => ({ LivePlacement: () => null }));

afterEach(cleanup);

const item: PinnedGridItem = { id: "p", at: { colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1 }, show: "all", visible: true, placement: { id: "w", module: "Clock" } };

function badge(zoom: number): HTMLElement {
  const base = defaultConfig().profiles[0];
  const stored: MonitorProfile = { ...base, id: "s", cols: 4, rows: 3, pages: [{ id: "a", name: "A", placements: [{ id: "u", module: "Clock", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true }] }], pinned: { items: [item] } };
  const { container } = render(
    <PinnedGridCanvas
      stored={stored}
      profile={profileWithPage(stored, "a")}
      pageId="a"
      items={[item]}
      appearance={{} as never}
      editing={false}
      selectedId={null}
      onSelect={vi.fn()}
      onCells={vi.fn()}
      actions={{ remove: vi.fn(), moveToPage: vi.fn() }}
      zoom={zoom}
    />
  );
  return container.querySelector<HTMLElement>("span[data-shot-skip]")!;
}

describe("the pin badge", () => {
  it("is sized at 1/zoom, and carries the conflict count", () => {
    const el = badge(0.5);
    expect(el.style.zoom).toBe("2");
    expect(el.textContent).toBe("1");
    expect(el.title).toBe("Covers 1 widget on this page");
  });
});
