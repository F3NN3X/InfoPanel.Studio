// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { HostedEditor } from "@tests/components/infopanel/edit/hosted-editor";
import { ProfileView } from "@/components/infopanel/ProfileView";
import { withCanvas } from "@/components/studio/import-actions";
import { newStored, readStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { storeItems } from "@/lib/infopanel/canvas-edit";
import { ZEROS } from "@/lib/infopanel/render/scene";
import { CANVAS_ID, type DashboardConfig, type Placement } from "@/lib/layout";
import { oneOfEach, profile } from "@tests/lib/infopanel/elements/fixture";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  // The Cores bars are bound: the live sensor stream opens, and never connects here.
  vi.stubGlobal(
    "EventSource",
    class {
      addEventListener() {}
      removeEventListener() {}
      close() {}
    },
  );
});

const items = oneOfEach();
const canvas = storeItems(newStored({ name: "Cards", width: 800, height: 480 }), profile, items);
const zone = { id: "z", module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, canvas } as Placement & { canvas: StoredCanvas };
const config = { profiles: [{ id: "p1", name: "Main", pages: [{ id: "pg", name: "Page 1", placements: [zone] }] }] } as unknown as DashboardConfig;
const history = { canUndo: false, canRedo: false, undo: vi.fn(), redo: vi.fn() };
const font = () => ({ fontFamily: "sans-serif" });

describe("studio elements", () => {
  it("each draws without throwing, the static ones from their spec before any bake", () => {
    const { container } = render(<ProfileView profile={profile} items={items} sensor={() => ({ reading: null, history: ZEROS })} now={new Date(0)} font={font} assets={new Map()} />);
    for (const path of ["0", "1", "2", "3", "4", "5", "6.0", "6.3", "7"]) expect(container.querySelector(`[data-path="${path}"]`), path).not.toBeNull();
    // The glow and the icon are images with no file yet: drawn as markup, never InfoPanel's placeholder.
    expect(container.querySelector('[data-path="3"] radialGradient')).not.toBeNull();
    expect(container.querySelector('[data-path="5"] svg g')).not.toBeNull();
  });

  it.each(["Ring", "LED bar", "Card", "Glow", "Divider", "Icon", "Cores", "Sparkline"])("shows %s's settings and badge in the inspector", (name) => {
    const index = ["Ring", "LED bar", "Card", "Glow", "Divider", "Icon", "Cores", "Sparkline"].indexOf(name);
    render(
      <ToastProvider>
        <HostedEditor zone={zone} setConfig={vi.fn()} history={history} profileId="p1" initialSelection={[String(index)]} />
      </ToastProvider>,
    );
    const inspector = screen.getByRole("complementary", { name: "Item" });
    expect(inspector.querySelector("[data-element]")).not.toBeNull();
    expect(within(inspector).getByLabelText(/^(Native|Baked|Approximated):/)).toBeTruthy();
  });

  it("an edit in the Element section commits the spec with its derived fields", () => {
    const setConfig = vi.fn();
    render(
      <ToastProvider>
        <HostedEditor zone={zone} setConfig={setConfig} history={history} profileId="p1" initialSelection={["2"]} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Drop shadow" }));
    const [update] = setConfig.mock.calls[0];
    const next = update(withCanvas(config, "z", zone.canvas)) as DashboardConfig;
    const card = readStored(next.profiles[0].pages[0].placements[0].canvas).items[2];
    expect(card).toMatchObject({ kind: "Image", element: { type: "card", shadow: { blur: 12 } } });
  });

  it("a palette slot change recolours the elements following it", () => {
    const setConfig = vi.fn();
    render(
      <ToastProvider>
        <HostedEditor zone={zone} setConfig={setConfig} history={history} profileId="p1" />
      </ToastProvider>,
    );
    const field = screen.getByLabelText("Palette Card");
    fireEvent.change(field, { target: { value: "#FF123456" } });
    fireEvent.blur(field);
    const [update] = setConfig.mock.calls[0];
    const stored = (update(withCanvas(config, "z", zone.canvas)) as DashboardConfig).profiles[0].pages[0].placements[0].canvas!;
    expect(stored.palette?.card).toBe("#FF123456");
    expect(readStored(stored).items[2]).toMatchObject({ kind: "Shape", FillColor: "#FF123456" });
  });
});
