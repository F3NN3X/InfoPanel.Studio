// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BackgroundEditor } from "@/components/studio/background-editor";
import CanvasEditorView from "@/components/infopanel/edit/canvas-editor";
import { LibraryDetail } from "./library-detail";
import { parseDisplayItemsXml, parseProfileXml } from "@/lib/infopanel/parse";
import { toStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { LIBRARY_MIME, setActiveLibraryDrag } from "@/lib/my-library/drag";
import { buildIndex } from "@/lib/my-library/model";
import type { LibraryCopy, LibraryItem } from "@/lib/library";
import type { Placement } from "@/lib/layout";

const copies = vi.hoisted(() => ({ recordCopy: vi.fn(async () => undefined) }));
vi.mock("@/lib/my-library/copies", () => copies);

const item: LibraryItem = {
  id: "i1",
  kind: "image",
  name: "bg",
  createdAt: "",
  updatedAt: "",
  files: [`${"a".repeat(64)}.png`],
  meta: { type: "png", size: 10, width: 100, height: 50 },
  copies: [],
};
const drop = () => {
  setActiveLibraryDrag(item);
  const data: Record<string, string> = { [LIBRARY_MIME]: JSON.stringify({ libraryItemId: "i1", kind: "image" }) };
  return { dataTransfer: { types: Object.keys(data), getData: (t: string) => data[t] ?? "" } };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});

describe("copy provenance", () => {
  it("records a Page background drop against the active profile", () => {
    const { container } = render(<BackgroundEditor value={{ type: "image" }} types={["image", "video"]} onChange={vi.fn()} profileId="p1" copyLabel="Main › Background" />);
    fireEvent.drop(container.firstElementChild!, drop());
    expect(copies.recordCopy).toHaveBeenCalledWith(item, { profileId: "p1", label: "Main › Background" });
  });

  it("records a drop inside the canvas editor against the active profile and zone", () => {
    const profile = parseProfileXml("<Profile><Name>P</Name><Width>800</Width><Height>480</Height></Profile>").profile;
    const { items } = parseDisplayItemsXml('<ArrayOfDisplayItem xmlns:xsi="x"><DisplayItem xsi:type="TextDisplayItem"><Name>one</Name></DisplayItem></ArrayOfDisplayItem>');
    const canvas: StoredCanvas = toStored({ name: "P", origin: "file", dataApi: null, defaultMode: "infopanel", profile, items, assets: new Map(), keyOf: () => null, fonts: [] });
    const zone = { id: "z", module: "canvas", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, canvas } as Placement & { canvas: StoredCanvas };
    const history = { canUndo: false, canRedo: false, undo: vi.fn(), redo: vi.fn() };
    const { container } = render(
      <ToastProvider>
        <CanvasEditorView zone={zone} setConfig={vi.fn()} history={history} onDone={vi.fn()} profileId="p1" />
      </ToastProvider>,
    );
    fireEvent.drop(container.querySelector(".overflow-hidden.min-h-0.flex-1")!, drop());
    expect(copies.recordCopy).toHaveBeenCalledWith(item, expect.objectContaining({ profileId: "p1", zoneId: "z" }));
  });

  it("lists a legacy \"*\" copy but gives it nowhere to jump", () => {
    const legacy: LibraryCopy = { profileId: "*", label: "Old › Background" };
    const kept: LibraryItem = { ...item, copies: [legacy, { profileId: "p1", zoneId: "z", label: "New" }] };
    const onJump = vi.fn();
    render(
      <LibraryDetail item={kept} index={buildIndex([kept])} primary={null} secondary={[]} onRename={vi.fn()} onRemove={vi.fn()} onMerge={vi.fn()} onVideo={vi.fn()} copyLabel={(c) => c.label ?? ""} onJump={onJump} />,
    );
    const old = screen.getByText("Old › Background").closest("button")!;
    expect(old.disabled).toBe(true);
    fireEvent.click(screen.getByText("New"));
    expect(onJump).toHaveBeenCalledWith(kept.copies[1]);
  });
});
