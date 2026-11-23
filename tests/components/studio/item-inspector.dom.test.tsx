// @vitest-environment happy-dom
// A panel widget's Style tab starts with the knob row (L46): Accent writes the widget's colour, its Reset follows the panel.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ItemInspector } from "@/components/studio/item-inspector";
import type { Placement } from "@/lib/layout";
import type { Widget } from "@/lib/panel-model";

const stat: Widget = { id: "w", kind: "stat", visible: true, label: "CPU" };
const panel = (widget: Widget): Placement => ({
  id: "p",
  module: "Panel",
  colStart: 1,
  rowStart: 1,
  colSpan: 2,
  rowSpan: 2,
  visible: true,
  panel: { id: "p", title: "Rig", titleVisible: true, visible: true, background: "panel", layout: "stack", widgets: [widget] },
});

function mount(zone: Placement, update: (fn: (p: Placement) => Placement) => void) {
  return render(
    <ItemInspector
      zone={zone}
      widget={zone.panel!.widgets[0]}
      appearance={{ profile: { values: { accent: "#00ff00" } }, profileName: "Desk" }}
      header={() => null}
      bound={null}
      update={update}
      onChangeKind={() => {}}
      onOpenExplorer={() => {}}
      onEditLock={() => {}}
      query=""
      onQuery={() => {}}
      identity={{ icon: null, name: "CPU", meta: () => "Panel item", hidden: false, onToggleVisible: () => {} }}
    />
  );
}

describe("a panel widget's knob row", () => {
  it("sets the widget's colour with Accent, and Reset gives it back to the panel", async () => {
    let zone = panel(stat);
    const update = (fn: (p: Placement) => Placement) => {
      zone = fn(zone);
    };
    const { rerender } = mount(zone, update);
    fireEvent.click(screen.getByRole("tab", { name: /Style/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Rose" }));
    expect(zone.panel!.widgets[0]).toMatchObject({ color: "#f37986", follow: { colors: false } });
    rerender(
      <ItemInspector
        zone={zone}
        widget={zone.panel!.widgets[0]}
        appearance={{ profile: { values: { accent: "#00ff00" } }, profileName: "Desk" }}
        header={() => null}
        bound={null}
        update={update}
        onChangeKind={() => {}}
        onOpenExplorer={() => {}}
        onEditLock={() => {}}
        query=""
        onQuery={() => {}}
        identity={{ icon: null, name: "CPU", meta: () => "Panel item", hidden: false, onToggleVisible: () => {} }}
      />
    );
    const accent = screen.getByRole("group", { name: "Accent" });
    fireEvent.click(within(accent).getByRole("button", { name: "Set here, reset to Rig" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reset" }));
    expect(zone.panel!.widgets[0].color).toBeUndefined();
    expect(zone.panel!.widgets[0].follow).toEqual({ colors: true });
  });
});
