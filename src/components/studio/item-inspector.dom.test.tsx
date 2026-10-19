// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { PANEL_ID, type Placement, type Widget, type WidgetKind } from "@/lib/layout";
import { convertKind } from "@/lib/panel-model";
import type { Appearance } from "@/lib/style-resolve";
import { setInspectorTab } from "./inspector/inspector-prefs";
import { ItemInspector } from "./item-inspector";

const zoneOf = (widget: Widget): Placement => ({
  id: "z",
  module: PANEL_ID,
  colStart: 1,
  rowStart: 1,
  colSpan: 2,
  rowSpan: 2,
  visible: true,
  settings: { label: "Rig" },
  panel: { id: "p", title: "Rig", titleVisible: true, visible: true, background: "panel", layout: "stack", widgets: [widget] },
});

/** The item inspector over one panel widget, its edits kept in state (`latest` reads them). */
function setup(widget: Widget, appearance: Appearance = { profileName: "Desk" }) {
  const latest = { zone: zoneOf(widget) };
  function Host() {
    const [zone, setZone] = useState(latest.zone);
    latest.zone = zone;
    const item = zone.panel!.widgets[0];
    const change = (fn: (p: Placement) => Placement) => setZone((z) => fn(z));
    return (
      <ItemInspector
        zone={zone}
        widget={item}
        appearance={appearance}
        header={() => null}
        bound={null}
        update={change}
        onChangeKind={(kind: WidgetKind) => change((z) => ({ ...z, panel: { ...z.panel!, widgets: [convertKind(z.panel!.widgets[0], kind)] } }))}
        onOpenExplorer={() => {}}
        query=""
        onQuery={() => {}}
        changedOnly={false}
        onChangedOnly={() => {}}
        identity={{ icon: null, name: "CPU", meta: () => "Panel item", hidden: false, onToggleVisible: () => {} }}
      />
    );
  }
  render(<Host />);
  return { latest, widget: () => latest.zone.panel!.widgets[0] };
}

/** A section by id; `open` clicks its header unless it is open already (hand-opened sections stay open across renders). */
const card = (id: string) => document.querySelector<HTMLElement>(`[data-setting-card="${id}"]`)!;
async function open(id: string) {
  const header = within(card(id)).getAllByRole("button")[0];
  if (header.getAttribute("aria-expanded") !== "true") await userEvent.click(header);
}

beforeEach(() => {
  localStorage.clear();
  setInspectorTab("item", "show");
});

describe("the panel item inspector", () => {
  it("has the four tabs; Kind chips leave out Custom gauge and convert the kind", async () => {
    const { widget } = setup({ id: "w", kind: "stat", visible: true, label: "CPU", sensor: "cpu.load", color: "#ff0000" });
    expect(screen.getAllByRole("tab").map((t) => t.textContent?.replace(/\d+$/, ""))).toEqual(["Show", "Style", "Data", "Behaviour"]);
    const chips = within(screen.getByRole("radiogroup", { name: "Kind" }));
    expect(chips.queryByRole("radio", { name: /Custom gauge/ })).toBeNull();
    expect(chips.getByRole("radio", { name: /Stat/ }).getAttribute("aria-checked")).toBe("true");
    await userEvent.click(chips.getByRole("radio", { name: /Sparkline/ }));
    expect(widget()).toMatchObject({ kind: "sparkline", label: "CPU", sensor: "cpu.load", color: "#ff0000" });
    // Sparkline has no thresholds: Behaviour has History instead.
    await userEvent.click(screen.getByRole("tab", { name: /Behaviour/ }));
    expect(card("thresholds")).toBeNull();
    expect(card("item-history")).toBeTruthy();
  });

  it("Color follows the panel; Use panel keeps the own colour, Customize brings it back", async () => {
    const { widget } = setup({ id: "w", kind: "stat", visible: true, color: "#ff0000" });
    await userEvent.click(screen.getByRole("tab", { name: /Style/ }));
    await open("colors");
    expect(within(card("colors")).getByText("Custom for this item")).toBeTruthy();
    await userEvent.click(within(card("colors")).getByRole("button", { name: "Use panel" }));
    expect(widget()).toMatchObject({ color: "#ff0000", follow: { colors: true } });
    expect(within(card("colors")).getByText("Follows panel “Rig”")).toBeTruthy();
    expect(card("colors").querySelector<HTMLFieldSetElement>('[data-setting-key="color"]')!.disabled).toBe(true);
    await userEvent.click(within(card("colors")).getByRole("button", { name: "Customize" }));
    expect(widget()).toMatchObject({ color: "#ff0000", follow: { colors: false } });
  });

  it("a section the profile locks reads Locked with no switch", async () => {
    setup({ id: "w", kind: "stat", visible: true, color: "#ff0000" }, { profileName: "Desk", profile: { locks: { colors: true } } });
    await userEvent.click(screen.getByRole("tab", { name: /Style/ }));
    await open("colors");
    expect(within(card("colors")).getByText("Locked by the profile theme")).toBeTruthy();
    expect(within(card("colors")).queryByRole("button", { name: "Customize" })).toBeNull();
  });

  it("shows the Custom gauge chip on a Custom gauge", () => {
    setup({ id: "w", kind: "customGauge", visible: true });
    expect(within(screen.getByRole("radiogroup", { name: "Kind" })).getByRole("radio", { name: /Custom gauge/ })).toBeTruthy();
  });
});
