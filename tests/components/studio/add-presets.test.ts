// Presets are the Add panel's variants (D-5, FORMAT.md §11): adding any widget x view lands exactly as the derivation from
// `meta.views` did before Phase 4. That derivation is frozen here, as it was in add-catalog.ts, and compared with the preset path.
import { describe, expect, it } from "vitest";
import { addCatalog, firstSentence, widgetRows, type AddItem } from "@/components/studio/add-catalog";
import { ALL_MODULES, type ModuleMeta } from "@/components/studio/studio-modules";
import { addSettings, builtinPresets, loadWidgetPresets } from "@/components/studio/widget-presets";
import { CARDS_ID } from "@/lib/layout";
import { modules } from "@/modules";

const presets = await loadWidgetPresets();

function frozenSize(def: [number, number] | undefined, mw: number, mh: number): [number, number] {
  const [w, h] = def ?? [3, 2];
  return [Math.max(w, mw), Math.max(h, mh)];
}

/** add-catalog.ts `moduleItem` at the commit Phase 4 started from (9b76610e), unchanged but for the types. */
function frozenItem(m: ModuleMeta): AddItem & { styles?: AddItem[] } {
  const [w, h] = frozenSize(m.defaultSize, m.minCols, m.minRows);
  const description = m.description ?? (m.id === CARDS_ID ? "Every sensor no other widget shows, as cards." : "");
  const item: AddItem = {
    kind: "widget",
    id: m.id,
    name: m.title,
    icon: m.icon,
    category: m.category && m.category !== "All" ? m.category : "Generic",
    w,
    h,
    mw: m.minCols,
    mh: m.minRows,
    blurb: m.blurb ?? (firstSentence(description) || "Widget"),
    tags: m.tags ?? "",
    description,
    drop: { kind: "module", id: m.id },
  };
  const views = m.views ?? [];
  if (views.length < 2) return item;
  const key = m.viewKey ?? "view";
  return {
    ...item,
    tags: [item.tags, ...views.flatMap((v) => [v.name.toLowerCase(), v.tags ?? ""])].filter(Boolean).join(" "),
    styles: views.slice(1).map((v): AddItem => {
      const [mw, mh] = v.minSize ?? [m.minCols, m.minRows];
      const [vw, vh] = frozenSize(v.defaultSize ?? m.defaultSize, mw, mh);
      return {
        ...item,
        id: `${m.id}:${v.id}`,
        name: `${m.title} · ${v.name}`,
        w: vw,
        h: vh,
        mw,
        mh,
        blurb: v.blurb ?? item.blurb,
        tags: v.tags ?? item.tags,
        drop: { kind: "module", id: m.id, settings: { [key]: v.id, ...v.applies } },
      };
    }),
  };
}

const bytes = (v: unknown) => JSON.stringify(v);

describe("presets against the views they came from", () => {
  const now = addCatalog(undefined, presets).widget;

  it("gives every widget the same row and the same variant rows, byte for byte", () => {
    expect(now.map((w) => w.id)).toEqual(ALL_MODULES.map((m) => m.id));
    for (const m of ALL_MODULES) {
      const old = frozenItem(m);
      const row = now.find((w) => w.id === m.id)!;
      const { styles, ...oldRow } = old;
      const { presets: variants, ...newRow } = row;
      expect(bytes(newRow), m.id).toBe(bytes(oldRow));
      expect((variants ?? []).map(bytes), m.id).toEqual((styles ?? []).map(bytes));
    }
  });

  it("covers every widget x view pair: each view has its row, and the rows are 1 + the further views", () => {
    let pairs = 0;
    for (const m of ALL_MODULES.filter((x) => (x.views?.length ?? 0) >= 2)) {
      const rows = widgetRows(now).filter((r) => r.drop.id === m.id);
      expect(rows.map((r) => r.id), m.id).toEqual([m.id, ...m.views!.slice(1).map((v) => `${m.id}:${v.id}`)]);
      pairs += rows.length;
    }
    expect(pairs).toBeGreaterThan(60);
  });

  it("keeps a widget with views and no presets.ts out: every widget with 2+ views ships one", () => {
    for (const m of ALL_MODULES.filter((x) => (x.views?.length ?? 0) >= 2)) expect(presets[m.id], m.id).toBeDefined();
  });
});

describe("a presets.ts", () => {
  it("has exactly one default, unique ids, and a view and settings that match the view it names", () => {
    for (const [id, list] of Object.entries(presets)) {
      const m = ALL_MODULES.find((x) => x.id === id)!;
      expect(m, id).toBeDefined();
      expect(list.filter((p) => p.default).length, id).toBe(1);
      expect(new Set(list.map((p) => p.id)).size, id).toBe(list.length);
      // a rail preset (Clock's) is checked below: it fills a rail slot, not a view of the grid
      for (const p of list.filter((x) => x.size !== "rail")) {
        // a widget without views (Clock) has only its default on the grid, which sets nothing
        if (!m.views) {
          expect(p.view, `${id} ${p.id}`).toBeUndefined();
          expect(p.default && p.settings, `${id} ${p.id}`).toEqual({});
          continue;
        }
        const view = m.views.find((v) => v.id === p.view);
        expect(view, `${id} ${p.id}`).toBeDefined();
        expect(p.settings, `${id} ${p.id}`).toEqual(view?.applies ?? {});
      }
    }
  });

  it("gives a rail preset settings of the widget's own and keeps it out of Add (owner Q3: Clock's)", () => {
    const rails = Object.entries(presets).flatMap(([id, list]) => list.filter((p) => p.size === "rail").map((p) => [id, p] as const));
    expect(rails.map(([id, p]) => `${id}:${p.id}`)).toEqual(["Clock:rail"]);
    const rows = widgetRows(addCatalog(undefined, presets).widget).map((r) => r.id);
    for (const [id, p] of rails) {
      const keys = new Set((modules.find((x) => x.id === id)!.settings ?? []).map((s) => s.key));
      for (const key of Object.keys(p.settings)) expect(keys.has(key), `${id} ${p.id} ${key}`).toBe(true);
      expect(rows, id).not.toContain(`${id}:${p.id}`);
    }
    // Clock's own default is the implicit one, so its Add row is as it was
    const clock = ALL_MODULES.find((m) => m.id === "Clock")!;
    expect(builtinPresets(clock, presets).filter((p) => p.size !== "rail")).toEqual(builtinPresets(clock, {}));
    expect(addCatalog(undefined, presets).widget.find((w) => w.id === "Clock")).toEqual(addCatalog(undefined, {}).widget.find((w) => w.id === "Clock"));
  });

  it("adds the default preset with no settings and any other with its view and settings", () => {
    const weather = ALL_MODULES.find((m) => m.id === "Weather")!;
    const [full, now] = builtinPresets(weather, presets);
    expect(addSettings(weather, full)).toBeUndefined();
    expect(addSettings(weather, now)).toEqual({ view: "now", showForecast: false, showStats: true, showFeels: true });
  });

  it("gives a widget without a presets.ts one implicit default: its default view, no settings, its default size", () => {
    const clock = ALL_MODULES.find((m) => m.id === "Clock")!;
    const list = builtinPresets(clock, {});
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ default: true, settings: {}, size: frozenSize(clock.defaultSize, clock.minCols, clock.minRows) });
    expect(addCatalog(undefined, {}).widget.find((w) => w.id === "Clock")!.presets).toBeUndefined();
  });
});
