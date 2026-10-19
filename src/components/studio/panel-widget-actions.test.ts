import { describe, expect, it } from "vitest";
import { PANEL_ID, type Placement, type Widget } from "@/lib/layout";
import { panelWidgetActions, selectionAfterRemove, type PanelWidgetDeps } from "./panel-widget-actions";

const widget = (id: string, extra: Partial<Widget> = {}): Widget => ({ id, kind: "stat", visible: true, ...extra });

const zone = (widgets: Widget[]): Placement => ({
  id: "z",
  module: PANEL_ID,
  colStart: 1,
  rowStart: 1,
  colSpan: 2,
  rowSpan: 2,
  visible: true,
  panel: { id: "p", title: "CPU", titleVisible: true, visible: true, background: "panel", widgets },
});

/** Run the actions against a placement, recording the result, keys and selection. */
function setup(widgets: Widget[], extra: Partial<PanelWidgetDeps> = {}) {
  const state = {
    placement: zone(widgets),
    keys: [] as (string | undefined)[],
    selected: extra.selectedWidgetId ?? null,
    copied: null as Widget | null,
  };
  let n = 0;
  const actions = panelWidgetActions({
    placement: state.placement,
    update: (fn, key) => {
      state.placement = fn(state.placement);
      state.keys.push(key);
    },
    selectedWidgetId: state.selected,
    onSelectWidget: (id) => (state.selected = id),
    widgetClipboard: null,
    onCopyWidget: (w) => (state.copied = w),
    newId: () => `new${++n}`,
    ...extra,
  });
  const ids = () => state.placement.panel!.widgets.map((w) => w.id);
  return { state, actions, ids };
}

describe("selectionAfterRemove", () => {
  const list = [widget("a"), widget("b"), widget("c")];
  it("picks the next widget, else the previous, else none", () => {
    expect(selectionAfterRemove(list, "a")).toBe("b");
    expect(selectionAfterRemove(list, "c")).toBe("b");
    expect(selectionAfterRemove([widget("a")], "a")).toBeNull();
    expect(selectionAfterRemove(list, "gone")).toBeNull();
  });
});

describe("panelWidgetActions", () => {
  it("removes a widget in one keyless step and selects its neighbour", () => {
    const { state, actions, ids } = setup([widget("a"), widget("b")], { selectedWidgetId: "a" });
    actions.remove("a");
    expect(ids()).toEqual(["b"]);
    expect(state.keys).toEqual([undefined]);
    expect(state.selected).toBe("b");
  });

  it("keeps the selection when removing another widget", () => {
    const { state, actions } = setup([widget("a"), widget("b")], { selectedWidgetId: "a" });
    actions.remove("b");
    expect(state.selected).toBe("a");
  });

  it("duplicates after the original and selects the copy", () => {
    const { state, actions, ids } = setup([widget("a"), widget("b")], { selectedWidgetId: "a" });
    actions.duplicate("a");
    expect(ids()).toEqual(["a", "new1", "b"]);
    expect(state.selected).toBe("new1");
  });

  it("copies, and pastes the clipboard after a widget under a new id", () => {
    const { state, actions } = setup([widget("a", { label: "CPU" })]);
    actions.copy("a");
    expect(state.copied?.label).toBe("CPU");
    const paste = setup([widget("a"), widget("b")], { widgetClipboard: widget("x", { label: "GPU" }) });
    paste.actions.paste("a");
    expect(paste.ids()).toEqual(["a", "new1", "b"]);
    expect(paste.state.placement.panel!.widgets[1].label).toBe("GPU");
    expect(paste.state.selected).toBe("new1");
  });

  it("pastes a copied widget with its thresholds and follow flags, brought up to the current model", () => {
    const clip = widget("x", { kind: "customGauge", fontSize: 150, follow: { colors: true } });
    const paste = setup([widget("a")], { widgetClipboard: clip });
    paste.actions.paste("a");
    const pasted = paste.state.placement.panel!.widgets[1];
    expect(pasted).toMatchObject({ kind: "customGauge", width: 150, follow: { colors: true } });
    expect(pasted).not.toHaveProperty("fontSize");
    const stat = setup([widget("a")], { widgetClipboard: widget("y", { thr: { warn: 60, crit: "off" } }) });
    stat.actions.paste("a");
    expect(stat.state.placement.panel!.widgets[1].thr).toEqual({ warn: 60, crit: "off" });
  });

    it("does nothing on paste with an empty clipboard", () => {
    const { state, actions } = setup([widget("a")]);
    actions.paste("a");
    expect(state.keys).toEqual([]);
  });

  it("steps a widget one place, and not past the ends", () => {
    const { state, actions, ids } = setup([widget("a"), widget("b"), widget("c")]);
    actions.step("a", 1);
    expect(ids()).toEqual(["b", "a", "c"]);
    // The actions read the panel they were made for: a and c sit at its ends.
    actions.step("a", -1);
    actions.step("c", 1);
    expect(state.keys).toHaveLength(1);
  });

  it("inserts after the selected widget and keys field edits per widget", () => {
    const { state, actions, ids } = setup([widget("a"), widget("b")], { selectedWidgetId: "a" });
    actions.insert(widget("n"));
    expect(ids()).toEqual(["a", "n", "b"]);
    expect(state.selected).toBe("n");
    actions.updateWidget("b", (w) => ({ ...w, label: "x" }), "label");
    expect(state.keys.at(-1)).toBe("panel-widget:b:label");
  });
});
