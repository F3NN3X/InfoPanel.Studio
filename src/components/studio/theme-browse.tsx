import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { ChevronRight, Eye, RotateCcw, Search, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { onRovingKeyDown } from "@/lib/roving";
import { SAMPLE_PRESET_GROUPS } from "@/lib/screen-templates/sample-presets";
import { cn } from "@/lib/utils";
import { loadLook } from "@/looks";
import { LOOK_IDS } from "@/looks/ids";
import type { Look } from "@/looks/look";
import { CARD_W, FOCUS, ThemeCard } from "./look-card";
import { GALLERY_IDS, galleryLooks, lookName, lookPreset } from "./look-gallery-model";
import { LookThumb } from "./look-thumb";
import { BROWSE_FILTERS, browseCounts, browseGroups, browseItems, TAG_FILTERS, type BrowseFilter, type BrowseItem } from "./theme-browse-model";
import { ThemeNameInput } from "./theme-name-input";
import { bringsRows, kindText } from "./theme-pack-model";
import type { PackImporterHandle } from "./user-packs";
import type { ImportedPack } from "./use-imported-packs";
import { usePackWithFonts } from "./use-pack-fonts";

const UserPacks = lazy(() => import("./user-packs"));

const SAMPLES = SAMPLE_PRESET_GROUPS.flatMap((g) => g.presets);

export interface ThemeBrowseProps {
  /** The screen or page Apply writes to ("Perf heavy"). */
  levelName: string;
  /** The Look the level shows (its card is Applied when no saved theme is). */
  currentLookId: string;
  /** The applied snapshot's id (a saved theme's card is Applied). */
  currentPresetId?: string;
  saved: readonly AppearancePreset[];
  packs: readonly ImportedPack[];
  /** Packs are turned off on this server. */
  packsOff: boolean;
  importer: RefObject<PackImporterHandle | null>;
  onPacksChange: () => void;
  /** The level's "Keep my background" choice, which an apply carries. */
  keepBackground: boolean;
  /** Apply a card: a Look or an imported pack (`look`: it keeps the level's own values) or a saved theme. */
  onApply: (preset: AppearancePreset, keepBackground: boolean, look: boolean) => void;
  /** Show it in Customise's preview without applying. */
  onPreview: (preset: AppearancePreset, look: boolean) => void;
  /** The applied theme's card: open Customise. */
  onCustomise: () => void;
  onDuplicate: (item: BrowseItem) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** An imported pack is being removed: take it off every level that wears it (Classic is drawn there) and return how many there were. */
  onRemovePack: (id: string) => number;
  /** The template themes (the older Saved and template themes picker) and its count line. */
  onTemplates: () => void;
  templatesText: string;
  /** The card the live preview shows (it is the one selected). */
  previewId?: string;
  /** A card clicked: the live preview shows it. */
  onPreviewCard?: (item: BrowseItem) => void;
  /** The pointer is on a card, or left it (`undefined`): Preview on hover. */
  onHoverCard?: (item: BrowseItem | undefined) => void;
  /** The cards the filters leave, in order: the preview's Next and Previous step through them. */
  onVisible?: (ids: readonly string[]) => void;
  /** While previewing, the detail shows this (the page as it would look) instead of the theme's thumbnail. */
  canvas?: ReactNode;
}

/** One group of cards under its heading. */
function Group({ title, note, count, children }: { title: string; note: string; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="flex items-baseline gap-2 text-body font-medium text-ui-1">
        {title}
        <span className="text-caption font-normal text-ui-3">{count}</span>
        <span className="text-caption font-normal text-ui-3">{note}</span>
      </h2>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, ${CARD_W}px)` }}>
        {children}
      </div>
    </section>
  );
}

interface DetailProps {
  item: BrowseItem;
  look: Look | undefined;
  applied: boolean;
  warnings: readonly string[];
  p: ThemeBrowseProps;
}

/** The detail pane: the theme's preview, kind line, actions and what it brings. */
function Detail({ item, look, applied, warnings, p }: DetailProps) {
  const pack = usePackWithFonts(item.kind === "pack" || item.kind === "yours" ? item.lookId : undefined);
  const shownLook = look ?? pack?.look;
  const [renaming, setRenaming] = useState(false);
  const saved = item.kind === "saved";
  useEffect(() => setRenaming(false), [item.id]);
  return (
    <aside aria-label="Theme detail" className="flex w-[380px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-ui-subtle bg-ui-chrome p-5 max-sm:w-full max-sm:border-l-0 max-sm:border-t">
      {p.canvas ?? <LookThumb preset={item.preset} width={338} className="rounded-ui-lg border border-ui-subtle" />}
      <div className="flex flex-col gap-1">
        {renaming ? (
          <ThemeNameInput
            initial={item.name}
            label="Theme name"
            onDone={(name) => {
              setRenaming(false);
              if (name) p.onRename(item.id, name);
            }}
          />
        ) : (
          <h2 className="truncate text-head font-medium text-ui-1">{item.name}</h2>
        )}
        <p className="text-caption text-ui-3">{kindText(item.kind, shownLook)}</p>
      </div>
      {item.description && <p className="text-body text-ui-2">{item.description}</p>}
      <div className="flex flex-col gap-2">
        {applied ? (
          <Button variant="secondary" className="w-full" onClick={p.onCustomise}>
            Customise {item.name}
          </Button>
        ) : (
          <Button variant="primary" className="w-full" onClick={() => p.onApply(item.preset, p.keepBackground, !saved)}>
            Apply to {p.levelName}
          </Button>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" icon={<Eye aria-hidden />} onClick={() => p.onPreview(item.preset, !saved)}>
            Preview on screen
          </Button>
          <Button className="flex-1" onClick={() => p.onDuplicate(item)}>
            Duplicate
          </Button>
        </div>
        {saved && (
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setRenaming(true)}>
              Rename
            </Button>
            <Button variant="danger" className="flex-1" onClick={() => p.onDelete(item.id)}>
              Delete
            </Button>
          </div>
        )}
      </div>
      {item.kind === "yours" && (
        <div data-pack-detail className="flex flex-col gap-2 rounded-ui-lg border border-ui-subtle bg-ui-panel p-3 text-caption text-ui-2">
          <span className="flex items-center gap-1.5 font-medium text-ui-1">
            {warnings.length > 0 && <TriangleAlert className="h-3.5 w-3.5 text-ui-warn" aria-hidden />}
            {warnings.length > 0 ? `Checked again just now: ${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}` : "Checked again just now: no problems"}
          </span>
          {warnings.map((w, i) => (
            <span key={i} className="text-ui-3">
              {w}
            </span>
          ))}
          <span className="text-ui-3">It is checked again every time it loads. No code or web links are allowed.</span>
          <Button variant="danger" small className="self-start" aria-label={`Remove ${item.name}`} onClick={() => void p.importer.current?.remove({ id: item.id, name: item.name })}>
            Remove this pack
          </Button>
        </div>
      )}
      <section aria-label="What it brings" className="flex flex-col gap-1">
        <h3 className="pb-1 text-caption font-medium text-ui-3">What it brings</h3>
        {bringsRows(pack, shownLook).map((r) => (
          <div key={r.label} className="flex min-h-8 items-center justify-between gap-3 text-body">
            <span className="text-ui-3">{r.label}</span>
            <span className="min-w-0 truncate text-right text-ui-2">{r.value}</span>
          </div>
        ))}
      </section>
    </aside>
  );
}

/**
 * Browse themes: the filters (kind, tag, search), the groups (Yours, Theme packs, Plain themes) as cards drawn by the real
 * renderer, and the detail pane of the one selected. Apply writes to the level; the pack importer sits behind the
 * header's Import a pack and shows what the validator said.
 */
export function ThemeBrowse(p: ThemeBrowseProps) {
  // Each theme loads on its own: one whose chunk fails is left out, the rest still list.
  const [loaded, setLoaded] = useState<Readonly<Record<string, Look>>>({});
  const [filter, setFilter] = useState<BrowseFilter>("all");
  const [tag, setTag] = useState<string>();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string>();
  // A theme whose chunk fails to load (offline, a stale deploy) is named with a Retry.
  const [failed, setFailed] = useState<readonly string[]>([]);
  const live = useRef(true);
  const load = (id: string) =>
    void loadLook(id).then(
      (look) => {
        if (!live.current || !look) return;
        setLoaded((m) => ({ ...m, [id]: look }));
        setFailed((f) => f.filter((x) => x !== id));
      },
      () => live.current && setFailed((f) => (f.includes(id) ? f : [...f, id]))
    );
  useEffect(() => {
    live.current = true;
    for (const id of GALLERY_IDS) load(id);
    return () => void (live.current = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const looks = useMemo(() => GALLERY_IDS.flatMap((id) => (loaded[id] ? [loaded[id]] : [])), [loaded]);
  // A pack a built-in theme now shares its id with is not drawn: no card, a notice with Remove.
  const shadowed = p.packs.filter((k) => LOOK_IDS.includes(k.id));
  const items = useMemo(
    () => browseItems(galleryLooks(looks, SAMPLES), p.saved, p.packs.filter((k) => !LOOK_IDS.includes(k.id)), (pk) => lookPreset({ id: pk.id, name: pk.name, description: "" })),
    [looks, p.saved, p.packs]
  );
  const counts = browseCounts(items);
  const groups = browseGroups(items, filter, tag, query);
  const appliedId = p.saved.some((s) => s.id === p.currentPresetId) ? p.currentPresetId : p.currentLookId;
  const selected = items.find((i) => i.id === p.previewId) ?? items.find((i) => i.id === picked) ?? items.find((i) => i.id === appliedId) ?? items[0];
  const visibleKey = [...groups.yours, ...groups.packs, ...groups.plain].map((i) => i.id).join("\n");
  useEffect(() => {
    p.onVisible?.(visibleKey ? visibleKey.split("\n") : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey]);
  const warningsOf = (id: string) => p.packs.find((k) => k.id === id)?.warnings ?? [];
  const card = (i: BrowseItem) => (
    <ThemeCard
      key={i.id}
      id={i.id}
      name={i.name}
      description={i.description}
      preset={i.preset}
      pack={i.kind === "pack" || i.kind === "yours"}
      applied={i.id === appliedId}
      selected={i.id === selected?.id}
      warnings={i.kind === "yours" ? warningsOf(i.id).length : 0}
      tabStop={i.id === selected?.id}
      previewing={i.id === p.previewId}
      onSelect={() => {
        setPicked(i.id);
        p.onPreviewCard?.(i);
      }}
      onApply={() => p.onApply(i.preset, p.keepBackground, i.kind !== "saved")}
      onHover={p.onHoverCard && ((on) => p.onHoverCard?.(on ? i : undefined))}
    />
  );
  const none = groups.yours.length + groups.packs.length + groups.plain.length === 0;
  return (
    <div className="flex min-h-0 flex-1 max-sm:flex-col max-sm:overflow-y-auto">
      <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-7 py-5 max-sm:overflow-visible max-sm:px-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex h-8 w-[220px] items-center gap-2 rounded-ui-md border border-ui-control bg-ui-chrome px-2.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ui-accent">
            <Search className="h-4 w-4 shrink-0 text-ui-hint" aria-hidden />
            <span className="sr-only">Search</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.currentTarget.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent text-body text-ui-1 outline-none placeholder:text-ui-hint" />
          </label>
          <div role="radiogroup" aria-label="Filter themes" onKeyDown={(e) => onRovingKeyDown(e, "[role=radio]")} className="flex gap-0.5 rounded-ui-md border border-ui-strong bg-ui-chrome p-0.5">
            {BROWSE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={filter === f.id}
                tabIndex={filter === f.id ? 0 : -1}
                onClick={() => setFilter(f.id)}
                className={cn("h-7 rounded-ui-sm px-2.5 text-caption", FOCUS, filter === f.id ? "bg-ui-active text-ui-1" : "text-ui-3 hover:text-ui-1")}
              >
                {f.label} <span className="text-ui-hint">{counts[f.id]}</span>
              </button>
            ))}
          </div>
          <div role="group" aria-label="Filter by tag" className="flex flex-wrap gap-1.5">
            {TAG_FILTERS.map((t) => (
              <Tag key={t.id} selected={tag === t.id} onClick={() => setTag(tag === t.id ? undefined : t.id)}>
                {t.label}
              </Tag>
            ))}
          </div>
        </div>
        {!p.packsOff && (
          <Suspense fallback={null}>
            <UserPacks ref={p.importer} onChange={p.onPacksChange} onRemove={p.onRemovePack} />
          </Suspense>
        )}
        {p.packsOff && (
          <p data-packs-off className="text-caption text-ui-3">
            Packs are turned off on this server.
          </p>
        )}
        {/* While previewing, the arrows step the preview: the card they move to is shown. */}
        <div onKeyDown={(e) => onRovingKeyDown(e, "[data-look-card]", p.previewId !== undefined)} className="flex flex-col gap-7">
          <Group title="Yours" note="Saved themes and imported packs" count={groups.yours.length}>
            {groups.yours.map(card)}
          </Group>
          <Group title="Theme packs" note="Scenery, effects, card details and their own fonts" count={groups.packs.length}>
            {groups.packs.map(card)}
          </Group>
          <Group title="Plain themes" note="Colours, corners and cards" count={groups.plain.length}>
            {groups.plain.map(card)}
          </Group>
        </div>
        {shadowed.map((k) => (
          <p key={k.id} data-pack-shadowed className="flex items-center gap-3 text-caption text-ui-3">
            {k.name}: a built-in theme now has this id, so this pack is not drawn. Give it its own id and import it again.
            <Button small variant="danger" aria-label={`Remove ${k.name}`} onClick={() => void p.importer.current?.remove({ id: k.id, name: k.name })}>
              Remove
            </Button>
          </p>
        ))}
        {failed.map((id) => (
          <p key={id} className="flex items-center gap-3 text-caption text-ui-3">
            Couldn't load {lookName(id)}.
            <Button small aria-label={`Retry ${lookName(id)}`} icon={<RotateCcw aria-hidden />} onClick={() => load(id)}>
              Retry
            </Button>
          </p>
        ))}
        {none && failed.length === 0 && <p className="text-caption text-ui-3">{items.length === 0 ? "Loading…" : "No theme matches."}</p>}
        <button
          type="button"
          onClick={p.onTemplates}
          data-nav-section="start"
          className={cn("flex min-h-11 w-full max-w-md items-center gap-2 rounded-ui-lg border border-ui-subtle px-3 text-left text-body text-ui-1 hover:border-ui-hover-edge", FOCUS)}
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">Saved and template themes</span>
            <span className="truncate text-caption text-ui-3">{p.templatesText}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-ui-hint" aria-hidden />
        </button>
      </div>
      {selected && <Detail item={selected} look={loaded[selected.lookId ?? ""]} applied={selected.id === appliedId} warnings={warningsOf(selected.id)} p={p} />}
    </div>
  );
}

export default ThemeBrowse;
