// The Widgets page (Phase 5b; sidebar between Library and Gauges, built like Gauges: browse and a builder view). Browse lists the
// user widgets the server holds (/api/widgets: Yours, saved from the builder here; Imported, from a package file) and the
// built-ins; Import reads a package (.zip), the validator's errors shown in plain words before anything is stored; Export writes
// one. The builder edits recipes and stores them through the same route. A lazy studio chunk: nothing here is in the kiosk entry.
// Code widgets (Phase 6b) are listed with the server's trust state; one that verified is loaded (`code/loader.ts`) for its preview
// and Add. "Third-party code widgets" and "Turn this widget off" are the server's switches (`/api/widgets/code`), so every page that
// asks this server obeys them, kiosks on other devices included.
// An open recipe closes, and its unsaved changes are discarded, only after the page has asked (Phase B1, G13).
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Plus, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarFill, BarTitle, PageBar } from "@/components/studio/page-bar";
import { WidgetStage } from "@/components/studio/add-preview";
import { moduleItem } from "@/components/studio/add-catalog";
import { ALL_MODULES, type ModuleMeta } from "@/components/studio/studio-modules";
import { builtinPresets, useWidgetPresets } from "@/components/studio/widget-presets";
import { sensorName } from "@/components/studio/widget-kinds";
import * as studio from "@/components/studio/studio-actions";
import type { StudioBridge } from "@/components/library/library-actions";
import { useHoldZoneShortcuts } from "@/components/library/use-hold-zone-shortcuts";
import { download } from "@/components/infopanel/export-dialog";
import { useSensors } from "@/hooks/useSensors";
import { openSettings } from "@/lib/desktop";
import { withHwinfoAliases } from "@/lib/hwinfo-aliases";
import { CARDS_ID } from "@/lib/layout";
import type { Appearance } from "@/lib/style-resolve";
import { modules } from "@/modules";
import { STANDARD_KEYS } from "@/modules/standard-settings";
import type { ModuleSettings } from "@/modules/types";
import { forgetCode, loadCode } from "@/widgets/code/loader";
import type { Data } from "@/widgets/core/types";
import { exportPackage, importPackage, packageOf } from "@/widgets/recipe/package";
import { isRecipeId, recipeModule } from "@/widgets/recipe/resolve";
import { listUserWidgets, loadRecipe, readPackage, removeWidget, storePackage } from "@/widgets/recipe/store";
import type { PackageFile, Recipe } from "@/widgets/recipe/types";
import { checkPackage } from "@/widgets/recipe/validate";
import type { Manifest } from "@/widgets/recipe/types";
import { toFlat } from "@/widgets/shared/data-adapter";
import { blockCount, duplicateRecipe, newRecipe, nextVersion, presetValues, recipeIdFor, valueText, withSample } from "./builder-model";
import type { Draft } from "./builder";
import { loadDrafts, saveDrafts } from "./drafts-store";
import { amend, commit, historyOf, redo, undo } from "./history";
import { START, whyNoStart } from "./start-points";
import { storedValues } from "./recipe-preview";
import { WidgetDetail, type WidgetDetailProps } from "./widget-detail";
import { WidgetsBrowse, type BuiltInEntry } from "./widgets-browse";
import { counts, isUnsaved, kindLine, screensLine, shown, trustOf, usesOf, type UserWidget, type WidgetFilter } from "./widgets-model";

/** The builder comes with its first open. */
const Builder = lazy(() => import("./builder").then((m) => ({ default: m.Builder })));

/** The dev fixtures' code widgets (`?fixture=widgets/<state>`, dev and fixtures builds only: a release build drops the import). */
const FIXTURES = import.meta.env.DEV || import.meta.env.VITE_DEV_FIXTURES === "1";
const fixtureState = (): string | undefined => (FIXTURES ? /^widgets\/(.+)$/.exec(new URLSearchParams(window.location.search).get("fixture") ?? "")?.[1] : undefined);

/** The server's code widget switches (`GET/PUT /api/widgets/code`): all on, `env` false under USER_CODE_WIDGETS=off, the ids off. */
interface Switches {
  on: boolean;
  env: boolean;
  off: string[];
}
const SWITCHES = "/api/widgets/code";
const readSwitches = async (): Promise<Switches> => {
  try {
    const res = await fetch(SWITCHES, { cache: "no-store" });
    const v = (res.ok ? await res.json() : {}) as Partial<Switches>;
    return { on: v.on !== false, env: v.env !== false, off: Array.isArray(v.off) ? v.off.filter((x) => typeof x === "string") : [] };
  } catch {
    return { on: true, env: true, off: [] };
  }
};
/** Sets the switches; undefined when the server took it, else why not. */
const writeSwitches = async (patch: Partial<Pick<Switches, "on" | "off">>): Promise<string | undefined> => {
  const res = await fetch(SWITCHES, { method: "PUT", headers: { "Content-Type": "application/json", "X-Dashboard-Widget": "1" }, body: JSON.stringify(patch) }).catch(() => undefined);
  return res?.ok ? undefined : (await res?.text().catch(() => "")) || "the server did not answer";
};

/** A code widget's preview (the detail pane's, or a card's `small` one): its module drawn with the live readings. */
function CodePreview({ id, reads, small }: { id: string; reads: string[]; small?: boolean }) {
  const sensors = useSensors(reads);
  const mod = recipeModule(id);
  return <div className={small ? "h-[132px] w-[260px]" : "h-[160px] w-[240px]"}>{mod?.render(sensors, {}) ?? <span className="text-body text-ui-3">No readings yet</span>}</div>;
}

export interface WidgetsPageProps {
  bridge: StudioBridge;
  appearance?: Appearance;
  pageStyle?: CSSProperties;
  /** Edit, after Add to a screen. */
  onShowEdit: () => void;
  onOpenSources: () => void;
  /** Bumped when the sidebar's Widgets is picked again: the page goes back to browse (open recipes stay open). */
  home?: number;
}

/** A recipe's card line: its description's first words. */
const blurbOf = (r: Recipe): string => r.description?.split(/[.:]/)[0] ?? r.name;

/** Built-ins on the page: every registered widget, in the registry's order. */
const BUILT_INS: ModuleMeta[] = ALL_MODULES.filter((m) => m.id !== CARDS_ID && !isRecipeId(m.id));
/** A built-in's own settings, from its module. */
const settingsOf = (id: string) => modules.find((m) => m.id === id)?.settings ?? [];

/** A widget package file's name for a recipe. */
const fileName = (r: Recipe): string => `${r.id.slice(7)}-${r.version}.widget.zip`;

/** Whether two manifests list the same files, byte for byte (each file's path and SHA-256). */
export const sameFiles = (a: Pick<Manifest, "files"> | undefined, b: Pick<Manifest, "files"> | undefined): boolean => {
  const list = (m: typeof a) => JSON.stringify((m?.files ?? []).map((f) => `${f.path} ${f.sha256}`).sort());
  return !!a && !!b && list(a) === list(b);
};

/** A question about an open recipe, waiting for the person's answer: close it without saving, or discard its changes (G13). */
interface Asking {
  key: string;
  kind: "close" | "discard";
}

/** The page's inline question (an alert dialog in the page, as the import's replace question): its words and two answers. */
function Ask({ title, detail, keep, go, onKeep, onGo }: { title: string; detail: string; keep: string; go: string; onKeep: () => void; onGo: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-label={title}
      data-ask=""
      onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onKeep())}
      className="mx-7 mt-5 flex flex-wrap items-center gap-3 rounded-ui-lg border border-ui-warn/40 bg-ui-warn/10 px-4 py-3 text-caption text-ui-2"
    >
      <div className="min-w-0 flex-1">
        <p className="text-body text-ui-1">{title}</p>
        <p className="mt-1">{detail}</p>
      </div>
      <Button small autoFocus onClick={onKeep}>
        {keep}
      </Button>
      <Button small variant="primary" onClick={onGo}>
        {go}
      </Button>
    </div>
  );
}

/** An import that would replace a stored recipe, waiting for the person's answer (B8). */
interface Replacing {
  id: string;
  file: string;
  files: PackageFile[];
  stored: { name: string; version: string; yours: boolean };
  incoming: { name: string; version: string };
}

export default function WidgetsPage({ bridge, appearance, pageStyle, onShowEdit, onOpenSources, home }: WidgetsPageProps) {
  const presetMap = useWidgetPresets();
  const [user, setUser] = useState<UserWidget[]>([]);
  const [notice, setNotice] = useState<string>();
  const [importError, setImportError] = useState<{ file: string; lines: string[] } | null>(null);
  const [replacing, setReplacing] = useState<Replacing | null>(null);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<WidgetFilter>("all");
  const [allBuiltIns, setAllBuiltIns] = useState(false);
  const [switches, setSwitches] = useState<Switches>({ on: true, env: true, off: [] });
  const thirdParty = switches.on && switches.env;
  const [selected, setSelected] = useState<string | null>(null);
  // open recipes with edits the server does not have come back from the autosave (`drafts-store.ts`), as the Gauges page's drafts do
  const [drafts, setDrafts] = useState<Draft[]>(loadDrafts);
  const [active, setActive] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = bridge.toast;
  // the studio's zone keys (Del, Ctrl+D, arrows …) would act on the screen hidden behind this page, as on Library and Gauges (B17)
  useHoldZoneShortcuts();
  // the live readings a save writes into the recipe's sample (only while the builder is open)
  const sensors = useSensors(active ? null : []);
  const liveData = useMemo(() => toFlat(withHwinfoAliases(sensors)) as Data, [sensors]);

  const refresh = async (select?: string) => {
    const [{ list, off }, sw] = await Promise.all([listUserWidgets(), readSwitches()]);
    setSwitches(sw);
    const loaded = await Promise.all(
      list.map(async (w): Promise<UserWidget> => {
        if (w.kind === "code") {
          const trust = trustOf(w.kind, w.trust);
          const s = w.off || trust.kind === "refused" ? undefined : await loadCode(w.id);
          const def = s && "def" in s ? s.def : undefined;
          const why = s && "why" in s ? s.why : undefined;
          return { id: w.id, name: def?.name ?? w.name, kind: "code", yours: false, issues: why ? [{ rule: "code", severity: "error", file: "widget.js", message: why }] : [], trust, def, off: w.off, blurb: def?.description ?? w.name, version: w.version, bytes: w.size };
        }
        const l = await loadRecipe(w.id);
        const r = l.recipe;
        return { id: w.id, name: r?.name ?? w.name, kind: "recipe", yours: w.origin === "studio", recipe: r, issues: l.issues, trust: { kind: "recipe" }, ...(w.trust === "unsigned" ? {} : { signed: w.trust }), blurb: r ? blurbOf(r) : w.name, version: w.version, bytes: w.size };
      }),
    );
    const state = fixtureState();
    const fixtures = state ? (await import("@/dev/fixtures/widgets")).widgetFixtures() : [];
    setUser([...loaded, ...fixtures]);
    setNotice(off ? "User widgets are switched off on this server (USER_WIDGETS=off): nothing can be imported or stored." : undefined);
    if (select) setSelected(select);
    else if (state) setSelected((s) => s ?? (fixtureSelection(state, loaded, fixtures)));
  };
  useEffect(() => {
    void refresh();
  }, []);

  const uses = (id: string) => usesOf(bridge.config, id);
  const visible = user.filter((w) => (thirdParty || w.kind !== "code") && shown(w, filter, query));
  const builtIns: BuiltInEntry[] = BUILT_INS.filter((m) => shown({ kind: "recipe", yours: false, name: m.title }, "all", query)).map((m) => ({ id: m.id, name: m.title, icon: m.icon, presets: builtinPresets(m, presetMap).length }));
  const c = counts(user.filter((w) => thirdParty || w.kind !== "code"), BUILT_INS.length);
  const setThirdParty = (on: boolean) =>
    void writeSwitches({ on }).then(async (why) => {
      if (why) return toast(`Not switched: ${why}`);
      toast(on ? "Third-party code widgets are on" : "Third-party code widgets are off on every screen of this server");
      await refresh();
      await Promise.all(user.filter((w) => w.kind === "code").map((w) => forgetCode(w.id)));
    });
  const turnOff = (w: UserWidget, off: boolean) =>
    void writeSwitches({ off: off ? [...switches.off.filter((x) => x !== w.id), w.id] : switches.off.filter((x) => x !== w.id) }).then(async (why) => {
      if (why) return toast(`Not switched: ${why}`);
      toast(off ? `${w.name} is off on every screen of this server` : `${w.name} is on again`);
      await forgetCode(w.id);
      await refresh();
    });

  /* ───────── adding to the screen in Edit ───────── */

  const addZone = (module: string, name: string, size: [number, number], settings?: ModuleSettings) => {
    const id = `zone-${Math.random().toString(36).slice(2, 10)}`;
    let placed = false;
    bridge.updateProfile((p) => {
      const next = studio.addModulePlacement(p, id, module, { cols: size[0], rows: size[1] });
      placed = next.placements.some((z) => z.id === id);
      return settings ? { ...next, placements: next.placements.map((z) => (z.id === id ? { ...z, settings } : z)) } : next;
    });
    if (!placed) return toast("No free space: resize or remove a widget first");
    bridge.select(id);
    toast(`Added ${name} to ${bridge.profile.name}`);
    onShowEdit();
  };
  const addRecipe = (r: Recipe, presetId?: string | null) => {
    const preset = r.presets.find((p) => p.id === presetId) ?? r.presets.find((p) => p.default);
    const values = preset?.default ? {} : storedValues(r, Object.fromEntries(Object.entries(presetValues(r, preset)).filter(([k]) => preset?.settings[k] !== undefined)));
    addZone(r.id, r.name, preset?.size ?? r.size.default, { recipeVersion: r.version, ...values });
  };

  /* ───────── import and export ───────── */

  /** Stores an imported package (a replaced one keeps its origin: the server's word). */
  const storeImport = async (file: string, files: PackageFile[], name: string, id: string) => {
    const why = await storePackage(files, "import");
    if (why) return setImportError({ file, lines: [why] });
    setImportError(null);
    toast(`Imported ${name}`);
    await refresh(id);
  };
  // B8: an import over a recipe the server holds asks first, showing both versions. The same files again change nothing; a signed
  // package of the stored version with other files is refused (a signed package changes its version when its files change).
  const importFile = async (file: File) => {
    setReplacing(null);
    try {
      const { files, skipped } = await importPackage(new Uint8Array(await file.arrayBuffer()));
      const checked = await checkPackage({ files });
      const errors = checked.issues.filter((i) => i.severity === "error");
      if (errors.length || !checked.recipe) {
        setImportError({ file: file.name, lines: [...errors.slice(0, 6).map((i) => `${i.file ? `${i.file}: ` : ""}${i.message}`), ...(skipped.length ? [`Left out, not part of a widget package: ${skipped.slice(0, 4).join(", ")}`] : [])] });
        return;
      }
      const r = checked.recipe;
      const stored = user.find((w) => w.id === r.id);
      if (!stored) return void (await storeImport(file.name, files, r.name, r.id));
      const old = (await readPackage(r.id)).files.find((f) => f.path === "manifest.json");
      const oldManifest = old && (JSON.parse(new TextDecoder().decode(old.bytes)) as Manifest);
      if (sameFiles(oldManifest, checked.manifest)) {
        setImportError(null);
        return toast(`${stored.name} ${stored.version} is installed already, with the same files`);
      }
      if ((stored.signed || checked.manifest?.signature) && stored.version === r.version)
        return setImportError({ file: file.name, lines: [`${stored.name} ${stored.version} is installed, and one of the two is signed: a package of the same version with other files is refused. A signed package changes its version when its files change.`] });
      setImportError(null);
      setReplacing({ id: r.id, file: file.name, files, stored: { name: stored.name, version: stored.version, yours: stored.yours }, incoming: { name: r.name, version: r.version } });
    } catch (e) {
      setImportError({ file: file.name, lines: [`It is not a widget package (.zip): ${(e as Error).message}`] });
    }
  };
  const exportStored = async (id: string, r: Recipe) => {
    const { files } = await readPackage(id);
    await download(fileName(r), exportPackage(files.length ? files : await packageOf(r)), "application/zip");
  };

  /* ───────── the builder ───────── */

  const open = (recipe: Recipe, images: PackageFile[] = [], stored?: Recipe) => {
    const key = recipe.id;
    setDrafts((list) => (list.some((d) => d.key === key) ? list : [...list, { key, history: historyOf(recipe), images, stored }]));
    setActive(key);
  };
  const taken = () => new Set([...user.map((w) => w.id), ...drafts.map((d) => d.history.present.id)]);
  const editStored = async (w: UserWidget) => {
    if (!w.recipe) return;
    const { files } = await readPackage(w.id);
    open(w.recipe, files.filter((f) => f.path.startsWith("images/")), w.recipe);
  };
  const draft = drafts.find((d) => d.key === active) ?? null;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) first.current = false;
    else setActive(null);
  }, [home]);
  const unsaved = drafts.filter(isUnsaved);
  useEffect(() => saveDrafts(drafts), [drafts]);
  const setDraft = (next: Draft) => setDrafts((list) => list.map((d) => (d.key === next.key ? next : d)));
  /** Closes an open recipe: the builder shows the next one open, else browse. */
  const close = (key: string) => {
    const left = drafts.filter((d) => d.key !== key);
    setDrafts(left);
    if (active === key) setActive(left[0]?.key ?? null);
    setAsking(null);
  };
  /** Close, asking first when it has what the server has not (a new recipe nothing was done to closes at once). */
  const askClose = (key: string) => {
    const d = drafts.find((x) => x.key === key);
    if (d && isUnsaved(d) && (d.stored || d.history.past.length)) setAsking({ key, kind: "close" });
    else close(key);
  };
  /** Discard: the open recipe goes back to what is stored, one undo step (Undo brings the changes back). */
  const discard = (key: string) => {
    const d = drafts.find((x) => x.key === key);
    if (d?.stored) setDraft({ ...d, history: commit(d.history, d.stored) });
    setAsking(null);
  };
  const askingDraft = asking && drafts.find((d) => d.key === asking.key);
  const question = askingDraft && asking && (
    <Ask
      title={asking.kind === "close" ? `Close ${askingDraft.history.present.name} without saving?` : `Discard your changes to ${askingDraft.history.present.name}?`}
      detail={
        asking.kind === "discard"
          ? `It goes back to the saved ${askingDraft.stored?.version}. Undo brings the changes back.`
          : askingDraft.stored
            ? `The changes since the saved ${askingDraft.stored.version} are lost; that version stays.`
            : "It was never saved: it is lost."
      }
      keep={asking.kind === "close" ? "Keep it open" : "Keep the changes"}
      go={asking.kind === "close" ? "Close without saving" : "Discard changes"}
      onKeep={() => setAsking(null)}
      onGo={() => (asking.kind === "close" ? close(asking.key) : discard(asking.key))}
    />
  );
  const save = async (): Promise<Recipe | undefined> => {
    if (!draft) return;
    const changed = !draft.stored || JSON.stringify(draft.stored) !== JSON.stringify(draft.history.present);
    if (!changed) return draft.stored;
    setSaving(true);
    try {
      // A recipe takes its id from its name when first saved (renaming "New widget" is the usual first step); after that it keeps it.
      const own = draft.history.present.id;
      const id = draft.stored ? own : recipeIdFor(draft.history.present.name, new Set([...taken()].filter((t) => t !== own)));
      const rekey = (r: Recipe): Recipe => (r.id === id ? r : { ...r, id });
      const base = withSample(rekey(draft.history.present), liveData);
      const recipe = draft.stored && draft.stored.version === base.version ? { ...base, version: nextVersion(base.version) } : base;
      const why = await storePackage(await packageOf(recipe, draft.images), "studio");
      if (why) {
        toast(`Not saved: ${why}`);
        return undefined;
      }
      setDraft({ ...draft, history: { past: draft.history.past.map(rekey), present: recipe, future: draft.history.future.map(rekey) }, stored: recipe });
      toast(`Saved ${recipe.name}`);
      void refresh();
      return recipe;
    } finally {
      setSaving(false);
    }
  };

  // An edited signed recipe (6a Q2): the server refuses a plain save (409), so the edit goes to a copy under a new id
  const signedStored = draft?.stored && user.some((w) => w.id === draft.stored?.id && w.signed);
  const saveCopy = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const recipe = withSample(duplicateRecipe(draft.history.present, `${draft.history.present.name} copy`, taken()), liveData);
      const why = await storePackage(await packageOf(recipe, draft.images), "studio");
      if (why) return toast(`Not saved: ${why}`);
      setDrafts((list) => [...list.filter((d) => d.key !== draft.key), { key: recipe.id, history: historyOf(recipe), images: draft.images, stored: recipe }]);
      setActive(recipe.id);
      toast(`Saved a copy: ${recipe.name}`);
      void refresh();
    } finally {
      setSaving(false);
    }
  };

  if (draft)
    return (
      <Suspense fallback={<div className="flex-1 bg-ui-app" />}>
        <Builder
          drafts={drafts}
          active={draft}
          onActive={setActive}
          onEdit={(recipe, images, fold) => setDraft({ ...draft, history: (fold ? amend : commit)(draft.history, recipe), images: images ?? draft.images })}
          onUndo={() => setDraft({ ...draft, history: undo(draft.history) })}
          onRedo={() => setDraft({ ...draft, history: redo(draft.history) })}
          onBack={() => setActive(null)}
          onSave={() => void save()}
          onSaveCopy={signedStored ? () => void saveCopy() : undefined}
          saving={saving}
          onExport={() =>
            // B7: the file is what the server holds, under the version it holds it at, so an edit is saved first (as Add does)
            void save().then(async (r) => {
              if (r) await exportStored(r.id, r);
            })
          }
          onAddToScreen={(presetId) =>
            void save().then((r) => {
              if (r) addRecipe(r, presetId);
            })
          }
          onClose={() => askClose(draft.key)}
          onDiscard={() => setAsking({ key: draft.key, kind: "discard" })}
          prompt={asking?.key === draft.key ? question : undefined}
          appearance={appearance}
          pageStyle={pageStyle}
          onOpenSources={onOpenSources}
        />
      </Suspense>
    );

  /* ───────── the detail pane ───────── */

  const codeDetail = (w: UserWidget): WidgetDetailProps => {
    const used = uses(w.id);
    const def = w.def;
    const why = w.off ? "it is turned off on the Widgets page" : w.trust.kind === "refused" ? "the signature does not check out" : w.issues[0]?.message;
    const remove = { label: "Remove", run: () => void removeWidget(w.id).then((ok) => (ok ? (setSelected(null), toast(`Removed ${w.name}`), refresh()) : toast("Not removed: the server refused"))), disabled: used.length > 0, title: used.length ? "It is on a screen" : undefined };
    const turn = { label: w.off ? "Turn this widget on" : "Turn this widget off", run: () => turnOff(w, !w.off) };
    return {
      name: w.name,
      kind: kindLine(w),
      trust: w.trust,
      preview: def && !w.off ? <CodePreview id={w.id} reads={def.reads} /> : <span className="max-w-[300px] text-center text-body text-ui-3">Not loaded{why ? `: ${why}` : ""}</span>,
      appearance,
      pageStyle,
      refused: w.trust.kind !== "refused" && !def && why ? why : undefined,
      onAdd: def && !w.off ? { label: "Add to a screen", run: () => addZone(w.id, def.name, def.defaultSize) } : { label: "Add to a screen", run: () => {}, disabled: true, title: why ?? "It did not load" },
      primary: { label: "About", icon: "about", run: () => toast(`${w.name} ${w.version}: ${def?.description ?? "a code widget"} (${w.id})`) },
      onExport: { label: "Export", run: () => void readPackage(w.id).then(({ files }) => (files.length ? download(`${w.id.slice(4)}-${w.version}.widget.zip`, exportPackage(files), "application/zip") : toast("Not exported: the server did not serve it"))) },
      menu: [turn, remove],
      presets: [],
      options: (def?.settings ?? []).slice(0, 6).map((o): [string, string] => [o.label, typeof o.default === "boolean" ? (o.default ? "On" : "Off") : String(o.default)]),
      screens: screensLine(used),
      onManageKeys: w.trust.kind === "user-key" || w.trust.kind === "refused" ? () => void openSettings("publishers") : undefined,
      onTurnOff: w.trust.kind === "refused" ? undefined : turn,
    };
  };
  const userDetail = (w: UserWidget): WidgetDetailProps => {
    if (w.kind === "code" && !w.fixture) return codeDetail(w);
    const used = uses(w.id);
    const r = w.recipe;
    const values = r ? presetValues(r, r.presets.find((p) => p.default)) : {};
    return {
      name: w.name,
      kind: kindLine(w, r && blockCount(r)),
      trust: w.trust,
      recipe: r,
      preview: w.fixture && <span className="text-body text-ui-2">{w.fixture.preview}</span>,
      appearance,
      pageStyle,
      refused: w.kind === "recipe" && !r ? (w.issues.find((i) => i.severity === "error")?.message ?? "the check refused it") : undefined,
      onAdd: r ? { label: "Add to a screen", run: () => addRecipe(r) } : { label: "Add to a screen", run: () => {}, disabled: true, title: w.kind === "code" ? "A dev fixture: there is no package to load" : "The check refused it" },
      primary: w.kind === "code" ? { label: "About", icon: "about", run: () => toast(`${w.name}: a dev fixture of an owner-signed code widget`) } : { label: "Edit recipe", icon: "edit", run: () => void editStored(w), disabled: !r },
      onExport: r ? { label: "Export", run: () => void exportStored(w.id, r) } : { label: "Export", run: () => {}, disabled: true },
      menu: r
        ? [
            { label: "Duplicate", run: () => open(duplicateRecipe(r, `${r.name} copy`, taken())) },
            { label: "Remove", run: () => void removeWidget(w.id).then((ok) => (ok ? (setSelected(null), toast(`Removed ${w.name}`), refresh()) : toast(`Not removed: the server refused`))), disabled: used.length > 0 },
          ]
        : [],
      presets: r ? r.presets.map((p) => p.name) : (w.fixture?.presets ?? []),
      options: r ? r.options.slice(0, 6).map((o) => [o.label, o.type === "sensor" && values[o.key] ? sensorName(String(values[o.key])) : valueText(o, values[o.key])]) : (w.fixture?.options ?? []),
      screens: screensLine(used),
    };
  };
  const builtInDetail = (m: ModuleMeta): WidgetDetailProps => {
    const presets = builtinPresets(m, presetMap);
    const make = START[m.id];
    const settings = settingsOf(m.id).filter((s) => !STANDARD_KEYS.has(s.key) && s.type !== "status").slice(0, 5);
    const def = presets.find((p) => p.default)?.size ?? m.defaultSize ?? [3, 2];
    return {
      name: m.title,
      kind: `Built in · ${m.category ?? "Generic"} · ${presets.length} preset${presets.length === 1 ? "" : "s"}`,
      preview: <WidgetStage item={moduleItem(m, presets)} appearance={appearance} pageStyle={pageStyle} stage={{ w: 334, h: 182 }} />,
      onAdd: { label: "Add to a screen", run: () => addZone(m.id, m.title, def) },
      primary: make
        ? { label: "Duplicate as a recipe", icon: "duplicate", run: () => open(make(`${m.title} recipe`, taken())) }
        : { label: "Duplicate as a recipe", icon: "duplicate", run: () => {}, disabled: true, title: `Can't be a recipe: ${whyNoStart(m.id)}` },
      menu: [],
      presets: presets.map((p) => p.name),
      options: settings.map((s) => [s.label, typeof s.default === "boolean" ? (s.default ? "On" : "Off") : String(s.default || "Auto")]),
      screens: screensLine(uses(m.id)),
    };
  };
  const pick = user.find((w) => w.id === selected);
  const pickBuiltIn = BUILT_INS.find((m) => m.id === selected);
  const detail = pick ? userDetail(pick) : pickBuiltIn ? builtInDetail(pickBuiltIn) : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ui-app font-ui">
      <PageBar>
        <BarTitle title="Widgets" note={`${BUILT_INS.length} built-in · ${c.yours} yours · ${user.filter((w) => !w.yours && (thirdParty || w.kind !== "code")).length} imported`} />
        <BarFill />
        <Button icon={<Download strokeWidth={1.5} />} onClick={() => fileInput.current?.click()}>
          Import
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".zip,application/zip"
          aria-label="Import a widget package"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void importFile(f);
          }}
        />
        <Button variant="primary" icon={<Plus strokeWidth={1.5} />} onClick={() => open(newRecipe("New widget", taken()))}>
          New widget
        </Button>
      </PageBar>
      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {unsaved.length > 0 && (
            <div data-unsaved-recipes className="mx-7 mt-5 flex flex-wrap items-center gap-2 rounded-ui-lg border border-ui-warn/40 bg-ui-warn/10 px-4 py-2.5 text-caption text-ui-2">
              <span className="mr-1">Open in the builder, not saved:</span>
              {unsaved.map((d) => (
                <span key={d.key} className="flex items-center gap-1">
                  <Button small onClick={() => setActive(d.key)}>
                    {d.history.present.name}
                  </Button>
                  <Button small variant="ghost" aria-label={`Discard ${d.history.present.name}`} title="Close it without saving" onClick={() => askClose(d.key)}>
                    Discard
                  </Button>
                </span>
              ))}
            </div>
          )}
          {question}
          {replacing && (
            <div role="alertdialog" aria-label="Replace a widget" data-import-replace="" className="mx-7 mt-5 flex flex-wrap items-center gap-3 rounded-ui-lg border border-ui-warn/40 bg-ui-warn/10 px-4 py-3 text-caption text-ui-2">
              <div className="min-w-0 flex-1">
                <p className="text-body text-ui-1">Replace {replacing.stored.name} with the file's?</p>
                <p className="mt-1">
                  Installed: {replacing.stored.name} {replacing.stored.version}
                  {replacing.stored.yours ? " (yours)" : ""} · In {replacing.file}: {replacing.incoming.name} {replacing.incoming.version}
                </p>
                <p className="mt-0.5 text-ui-3">Screens using it draw the file's version; it stays {replacing.stored.yours ? "in Yours" : "in Imported"}.</p>
              </div>
              <Button small onClick={() => setReplacing(null)}>
                Keep the installed one
              </Button>
              <Button
                small
                variant="primary"
                onClick={() => {
                  const r = replacing;
                  setReplacing(null);
                  void storeImport(r.file, r.files, r.incoming.name, r.id);
                }}
              >
                Replace
              </Button>
            </div>
          )}
          {importError && (
            <div role="alert" className="mx-7 mt-5 flex gap-3 rounded-ui-lg border border-ui-danger/40 bg-ui-danger/10 px-4 py-3 text-caption text-ui-2">
              <div className="min-w-0 flex-1">
                <p className="text-body text-ui-1">{importError.file} was not imported</p>
                <ul className="mt-1 list-disc pl-5">
                  {importError.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
              <button type="button" aria-label="Dismiss" onClick={() => setImportError(null)} className="self-start rounded-ui-sm p-1 text-ui-3 hover:text-ui-1">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <WidgetsBrowse
            query={query}
            onQuery={setQuery}
            filter={filter}
            onFilter={setFilter}
            counts={c}
            thirdParty={thirdParty}
            onThirdParty={setThirdParty}
            thirdPartyLocked={!switches.env}
            codePreview={(w) => w.def && <CodePreview id={w.id} reads={w.def.reads} small />}
            yours={visible.filter((w) => w.yours)}
            imported={visible.filter((w) => !w.yours)}
            builtIns={builtIns}
            showBuiltIns={filter === "all"}
            allBuiltIns={allBuiltIns || !!query}
            onAllBuiltIns={() => setAllBuiltIns(true)}
            selected={selected}
            onSelect={setSelected}
            onOpen={(id) => {
              const w = user.find((x) => x.id === id);
              if (w?.recipe) void editStored(w);
            }}
            usesOf={uses}
            appearance={appearance}
            pageStyle={pageStyle}
            notice={notice}
          />
        </div>
        {detail ? (
          <WidgetDetail key={selected} {...detail} />
        ) : (
          <aside className="flex w-[380px] shrink-0 items-center justify-center border-l border-ui-subtle bg-ui-chrome p-6 text-center text-body text-ui-3">Select a widget to see it here. Double-click a recipe to edit it.</aside>
        )}
      </div>
    </div>
  );
}

/** The widget a fixture state opens on: the first recipe ("recipe"), the owner-signed fixture, or a real code widget in that state. */
function fixtureSelection(state: string, loaded: readonly UserWidget[], fixtures: readonly UserWidget[]): string | null {
  if (state === "owner-signed") return fixtures.find((w) => w.trust.kind === "owner")?.id ?? null;
  if (state === "user-key") return loaded.find((w) => w.trust.kind === "user-key")?.id ?? null;
  if (state === "refused") return loaded.find((w) => w.trust.kind === "refused")?.id ?? null;
  return loaded.find((w) => w.yours)?.id ?? loaded[0]?.id ?? null;
}
