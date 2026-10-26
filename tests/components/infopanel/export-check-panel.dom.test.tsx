// @vitest-environment happy-dom
// The live Export check in Edit (one-editor SPEC §5.1, §5.6, §8; acceptance 13 for the looks this build has): on a
// screen made for InfoPanel, a studio-only look that is set is marked Approximated in the inspector, counted in the
// header pill, listed with its value in the check and marked in Layers. Made for Studio panels shows none of it.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { HostedEditor } from "@tests/components/infopanel/edit/hosted-editor";
import { applyElement, elementOf } from "@/lib/infopanel/elements/apply";
import { newElement } from "@/lib/infopanel/elements/create";
import { newItem } from "@/lib/infopanel/editor/create";
import { storeItems } from "@/lib/infopanel/canvas-edit";
import { newStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import type { DisplayItem } from "@/lib/infopanel/schema";
import { CANVAS_ID, type Placement } from "@/lib/layout";
import { palette, profile } from "@tests/lib/infopanel/elements/fixture";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});

const blurred = applyElement({ ...newElement("card", profile, palette), Name: "Glass", element: { ...elementOf(newElement("card", profile, palette))!, blur: 16 } } as unknown as DisplayItem);
const canvas = storeItems(newStored({ name: "Desk", width: 800, height: 480 }), profile, [{ ...newItem("Text", profile, palette), Name: "CPU" }, blurred]);
const zone = { id: "z", module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, canvas } as Placement & { canvas: StoredCanvas };
const history = { canUndo: false, canRedo: false, undo: vi.fn(), redo: vi.fn() };

const editor = (checkOn: boolean, onExport = vi.fn()) =>
  render(
    <ToastProvider>
      <HostedEditor tab="layers" zone={zone} setConfig={vi.fn()} history={history} profileId="p1" checkOn={checkOn} onExport={onExport} initialSelection={["1"]} />
    </ToastProvider>,
  );

describe("the Export check in Edit", () => {
  it("marks a set studio-only look Approximated in the inspector, Layers and the pill", () => {
    editor(true);
    const inspector = screen.getByRole("complementary", { name: "Item" });
    expect(within(inspector).getByRole("note", { name: "On InfoPanel" }).textContent).toContain("On InfoPanel: approximated");
    expect(within(inspector).getByText(/Backdrop blur shows on Studio panels/)).toBeTruthy();
    expect(within(inspector).getAllByLabelText("Approximated on InfoPanel").length).toBeGreaterThan(0);
    const glass = screen.getAllByRole("treeitem").find((r) => r.textContent?.includes("Glass"))!;
    expect(within(glass).getByLabelText("Approximated")).toBeTruthy();
    const pill = screen.getByRole("button", { name: /^Export check/ });
    expect(pill.textContent).toContain("1 as is");
    expect(pill.textContent).toContain("1 approximated");
  });

  it("opens the check from the pill, lists the parts, selects one and exports", () => {
    const onExport = vi.fn();
    editor(true, onExport);
    fireEvent.click(screen.getByRole("button", { name: /^Export check/ }));
    const panel = screen.getByRole("complementary", { name: "Export check" });
    expect(within(panel).getByRole("region", { name: "Approximated" }).textContent).toContain("Backdrop blur (16 px)");
    expect(within(panel).getByRole("region", { name: "Exports as is" }).textContent).toContain("CPU");
    fireEvent.click(within(panel).getByRole("button", { name: "Export .infopanel" }));
    expect(onExport).toHaveBeenCalled();
    fireEvent.click(within(panel).getByRole("button", { name: /^CPU/ }));
    expect(screen.queryByRole("complementary", { name: "Export check" })).toBeNull();
    expect(screen.getByRole("complementary", { name: "Item" }).textContent).toContain("CPU");
  });

  it("shows none of it on a screen made for Studio panels", () => {
    editor(false);
    expect(screen.queryByRole("button", { name: /^Export check/ })).toBeNull();
    expect(screen.queryByRole("note", { name: "On InfoPanel" })).toBeNull();
    expect(screen.queryByLabelText("Approximated on InfoPanel")).toBeNull();
  });
});
