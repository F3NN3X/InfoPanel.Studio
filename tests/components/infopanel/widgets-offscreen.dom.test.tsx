// @vitest-environment happy-dom
// A Free page's Studio widgets exported from any way into the Export window (one-editor SPEC §7.4): drawn offscreen
// with their values tagged, so Recreate is the widget's picture with its values on top, and the picture and its file
// survive the .infopanel and its reimport. The kiosk's drawing stays untagged.
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// One transparent pixel: the picture the conversion takes of a widget.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
vi.mock("modern-screenshot", () => ({ domToPng: vi.fn(async () => PNG) }));

import { modules } from "@/modules";
import { nativeLayer } from "@/components/infopanel/native";
import { widgetDrawer } from "@/components/infopanel/CanvasZone";
import { WidgetsOffscreen } from "@/components/infopanel/widgets-offscreen";
import { knownWidget, widgetPlacement } from "@/components/studio/placement-content";
import { entriesFromZip, loadExport } from "@/lib/infopanel/archive";
import { newItem } from "@/lib/infopanel/editor/create";
import { infopanelFile } from "@/lib/infopanel/export/studio-export";
import { newStored, readStored } from "@/lib/infopanel/import/stored";
import { exportWidgets } from "@/lib/infopanel/native/widget-export";
import { newWidgetItem, widgetPaths } from "@/lib/infopanel/native/widget-item";
import type { DisplayItem } from "@/lib/infopanel/schema";

const { profile } = readStored(newStored({ name: "Arc", width: 800, height: 480 }));
const items = [newItem("Text", profile), newWidgetItem({ module: "Clock" }, { x: 40, y: 60, w: 300, h: 150 }, "Clock")];

/** The offscreen canvas, once it has drawn. */
async function drawn(): Promise<HTMLElement> {
  let root: HTMLElement | null = null;
  render(<WidgetsOffscreen items={items} width={800} height={480} sensors={{}} warmup={0} onReady={(r) => (root = r)} />);
  await waitFor(() => expect(root?.querySelector('[data-widget-item="1"] [data-ip-key]')).toBeTruthy());
  return root!;
}

afterEach(() => vi.restoreAllMocks());

describe("Studio widgets drawn for the export", () => {
  it("tags the widget's live values offscreen, and only there: the kiosk's drawing has none", async () => {
    await modules.find((m) => m.id === "Clock")?.preload?.();
    const root = await drawn();
    expect(root.querySelector('[data-widget-item="0"]')).toBeNull();
    const ctx = { fontScale: 1.33, keyOf: () => null, assetUrl: () => null };
    const kiosk = nativeLayer(items, ctx, {}, { font: {} as never, now: new Date(), history: () => [], widget: widgetDrawer({}) });
    const { container } = render(<div>{[...kiosk.elements.values()]}</div>);
    expect(container.querySelector('[data-widget-item="1"]')).toBeTruthy();
    expect(container.querySelector("[data-ip-key]")).toBeNull();
  });

  it("recreates a widget as its picture with its values on top, and the picture comes back on reimport", async () => {
    await modules.find((m) => m.id === "Clock")?.preload?.();
    const root = await drawn();
    // happy-dom lays nothing out: every node gets a box, so the tagged values are read.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 120, bottom: 24, width: 120, height: 24, toJSON: () => ({}) } as DOMRect);
    const out = await exportWidgets({ items, assets: new Map() }, { root, sensors: {}, look: profile, zoneOf: widgetPlacement, known: knownWidget });
    expect(widgetPaths(out.doc.items)).toEqual([]);
    const group = out.doc.items[1] as Extract<DisplayItem, { kind: "Group" }>;
    expect(group).toMatchObject({ kind: "Group", Name: "Clock" });
    const picture = group.DisplayItems.find((i) => i.kind === "Image") as Extract<DisplayItem, { kind: "Image" }>;
    expect(picture).toMatchObject({ Type: "FILE", RelativePath: true });
    expect(group.DisplayItems.some((i) => i.kind === "Clock" || i.kind === "Calendar")).toBe(true);
    expect([...out.doc.assets.values()].map((a) => a.name)).toEqual([picture.FilePath]);

    const back = await loadExport(entriesFromZip(infopanelFile(profile, out.doc).bytes));
    const again = back.items[1] as Extract<DisplayItem, { kind: "Group" }>;
    expect(again.DisplayItems.find((i) => i.kind === "Image")).toMatchObject({ FilePath: picture.FilePath });
    expect([...back.assets.keys()]).toEqual([picture.FilePath!.toLowerCase()]);
  });
});
