// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { HostedEditor } from "@tests/components/infopanel/edit/hosted-editor";
import { ProfileView } from "@/components/infopanel/ProfileView";
import { storeItems } from "@/lib/infopanel/canvas-edit";
import { newComposite, type CompositeType } from "@/lib/infopanel/elements/create";
import { newStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import type { DisplayItem } from "@/lib/infopanel/schema";
import { ZEROS } from "@/lib/infopanel/render/scene";
import { CANVAS_ID, type Placement } from "@/lib/layout";
import { palette, profile } from "@tests/lib/infopanel/elements/fixture";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  vi.stubGlobal("EventSource", class { addEventListener() {} removeEventListener() {} close() {} });
});

const TYPES: CompositeType[] = ["row", "rows", "stack", "dual", "doublering", "drives", "shadowtext"];
const items = TYPES.map((t, i) => newComposite(t, profile, palette, [], 10, 10 + i * 60));
/** The path of the first leaf under the i-th item (a Group has no box of its own to find). */
const leaf = (i: number) => {
  let path = String(i);
  for (let g: DisplayItem = items[i]; g.kind === "Group"; g = g.DisplayItems[0]) path += ".0";
  return path;
};
const canvas = storeItems(newStored({ name: "Composites", width: 800, height: 480 }), profile, items);
const zone = { id: "z", module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, canvas } as Placement & { canvas: StoredCanvas };
const history = { canUndo: false, canRedo: false, undo: vi.fn(), redo: vi.fn() };

describe("composite elements", () => {
  it("each draws without throwing", () => {
    const { container } = render(<ProfileView profile={profile} items={items} sensor={() => ({ reading: null, history: ZEROS })} now={new Date(0)} font={() => ({ fontFamily: "sans-serif" })} assets={new Map()} />);
    for (let i = 0; i < TYPES.length; i++) expect(container.querySelector(`[data-path="${leaf(i)}"]`), TYPES[i]).not.toBeNull();
  });

  it.each(TYPES.map((t, i) => [t, i] as const))("shows %s's settings and badge in the inspector", (_t, index) => {
    render(
      <ToastProvider>
        <HostedEditor zone={zone} setConfig={vi.fn()} history={history} onDone={vi.fn()} profileId="p1" initialSelection={[String(index)]} />
      </ToastProvider>,
    );
    const inspector = screen.getByRole("complementary", { name: "Item" });
    expect(inspector.querySelector("[data-element]")).not.toBeNull();
    expect(within(inspector).getByLabelText(/^(Native|Baked|Approximated):/)).toBeTruthy();
  });
});

