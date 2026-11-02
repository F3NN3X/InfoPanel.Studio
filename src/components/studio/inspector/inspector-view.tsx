import { onRovingKeyDown } from "@/lib/roving";
import { scrollBehavior } from "@/lib/scroll-behavior";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Popover } from "@/components/ui/popover";
import { useSensorCatalog } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import type { ModuleSetting } from "@/modules/types";
import { FollowsTheme } from "./follows-theme";
import { Toggle } from "@/components/ui/toggle";
import { INSPECTOR_SCROLL, useInspectorChrome } from "../inspector-layout";
import {
  allSections,
  changedCount,
  extraMatches,
  inspectorTabs,
  jumpTarget,
  needsAdvanced,
  resetKeysOfSection,
  searchAll,
  tabStates,
  visibleSection,
  visibleSections,
  TAB_LABELS,
  type FollowMode,
  type InspectorContext,
  type InspectorSection,
  type TabId,
} from "../inspector-model";
import { SectionPad } from "../panel-section";
import { SETTING_CARD, SettingSection } from "../setting-card";
import { SettingField, type FieldsApi } from "../settings-panel";
import { SettingsSearch } from "../zone-inspector-parts";
import { pickTab, showAdvanced, useAccordionPref, useAdvancedPref, useInspectorTab } from "./inspector-prefs";
import { sectionIcon } from "./section-icons";
import { SheetView, type SheetIdentity } from "./sheet-view";
import { DotLegend } from "./source-dot";

/** A section card's inheritance chip and what goes with it (`sectionInherit`). */
export interface SectionInherit {
  /** In the header, before the chevron. */
  chip: ReactNode;
  /** The amber kept-override note, above the rows. */
  note?: ReactNode;
  /** The action line under the rows (Reset to inherited · Edit Page ↗). */
  actions: ReactNode;
  /** ⌫ pressed inside the section (not in a field) resets it. */
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  /** Whether the section follows the theme, is custom or locked (Advanced off collapses the first and last). */
  mode: FollowMode;
  /** Take the section over from the theme ("Customise"). */
  onCustomise: () => void;
}

/** What a context adds to one of its sections around the schema's rows. */
export interface SectionParts {
  /** Above the rows (the widget picker, Follow / Custom). */
  top?: ReactNode;
  /** The custom UI of a special section, after any rows. */
  body?: ReactNode;
  /** Below the rows (Visible). */
  bottom?: ReactNode;
  /** With the section's More rows (the zone frame). */
  more?: ReactNode;
  /** Header controls before Reset (the style tools). */
  actions?: ReactNode;
  /** After the section's title (a section's own marker). */
  pill?: ReactNode;
  /** Changed fields the custom UI holds (added to the rows'). */
  changed?: number;
  /** Reset the custom UI's fields (the section's Reset also clears its rows). */
  onReset?: () => void;
  /** The section `revealWidgetEditor` scrolls to (opened when it appears). */
  editor?: boolean;
  /** A plain block with its own title row (Bound data): no header, count or Reset. */
  plain?: boolean;
}

interface InspectorViewProps {
  context: InspectorContext;
  /** The remembered-tab key ("widget", "panel", "dashboard"). */
  contextKey: string;
  /** The header (icon, name, actions, placement row); a function gets the count of own values. */
  header: ReactNode | ((changed: number) => ReactNode);
  fields: FieldsApi;
  /** Whether a setting shows for the current values (`visibleIf`). */
  visible?: (def: ModuleSetting) => boolean;
  /** Whether a section has anything to show (a custom card its zone lacks drops it). */
  present?: (section: InspectorSection) => boolean;
  /** The custom UI of a section (no hooks: called while rendering). */
  parts: (section: InspectorSection) => SectionParts;
  /** The notes and banners above a tab's sections (or a context without tabs). */
  notes?: (tab: TabId | undefined) => ReactNode;
  /** A section's inheritance chip in place of its Follow bar (the zone inspector); undefined: none. */
  inherit?: (section: InspectorSection) => SectionInherit | undefined;
  query: string;
  onQuery: (query: string) => void;
  /** Open, reveal and outline a section whenever `seq` changes. */
  jumpTo?: { id: string; key?: string; seq: number };
  /** The phone sheet's compact header (below full height). */
  identity: SheetIdentity;
  /** The sheet's Quick tool: the pinned settings, in order. */
  quickKeys?: readonly string[];
  /** Show the settings search (default); the profile inspector turns it off. */
  searchable?: boolean;
  /** The footer in place of the dot legend; `null` for none. */
  footer?: ReactNode;
  /** An icon for each tab and a line under the tabs saying what the active one holds. */
  tabInfo?: Partial<Record<TabId, { icon: ReactNode; description: string }>>;
  /** A part's Place row, edge to edge under the header (Edit v3 SPEC §10.2). */
  place?: ReactNode;
  /** After every section: a part's LAYER and On InfoPanel (SPEC §10.2 items 5 and 6). */
  after?: ReactNode;
  /** The tabs as a row of words with the active one underlined (SPEC §10.2), not a segmented pill. */
  underline?: boolean;
  /** The tabs' words, where the context names them its own way (an item's Item · Sensor · Look). */
  tabLabels?: Partial<Record<TabId, string>>;
}

/** How long a jumped-to section stays outlined. */
const FLASH_MS = 1200;

const always = () => true;

/** A note or banner above the sections. */
export function InspectorNote({ children }: { children: ReactNode }) {
  return (
    <div className="mx-4 mb-1 mt-3 rounded-lg border border-ui-default bg-ui-raised px-3 py-2.5 text-caption leading-snug text-ui-2">
      {children}
    </div>
  );
}

/** A changed-count pill (tabs, the Changed toggle). */
function Count({ n }: { n: number }) {
  return <span className="rounded-lg bg-ui-accent/[.18] px-[5px] py-px font-ui-mono text-[10px] text-ui-accent-text">{n}</span>;
}

/** The tabs as a segmented pill, each with its changed count; an empty tab is dimmed and disabled. */
function Tabs({
  tabs,
  active,
  counts,
  onTab,
  info,
  underline,
}: {
  tabs: { id: TabId; label: string; disabled: boolean }[];
  active: TabId | undefined;
  counts: Partial<Record<TabId, number>>;
  onTab: (tab: TabId) => void;
  info?: InspectorViewProps["tabInfo"];
  underline?: boolean;
}) {
  const description = active && info?.[active]?.description;
  if (underline)
    return (
      <div role="tablist" onKeyDown={(e) => onRovingKeyDown(e, '[role="tab"]')} className="flex shrink-0 gap-3.5 border-b border-ui-subtle px-3.5">
        {tabs.map((t) => {
          const selected = t.id === active;
          const n = counts[t.id] ?? 0;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              disabled={t.disabled}
              onClick={() => onTab(t.id)}
              className={cn(
                "-mb-px flex h-8 items-center gap-1.5 whitespace-nowrap border-b-2 text-caption transition-colors",
                selected ? "border-ui-accent text-ui-1" : "border-transparent text-ui-4 enabled:hover:text-ui-1",
                t.disabled && "opacity-35"
              )}
            >
              {t.label}
              {n > 0 && <Count n={n} />}
            </button>
          );
        })}
      </div>
    );
  return (
    <div className={cn("shrink-0 pl-4 pr-3", description ? "pb-1.5" : "pb-2.5")}>
      <div role="tablist" onKeyDown={(e) => onRovingKeyDown(e, '[role="tab"]')} className="flex flex-wrap gap-0.5 rounded-lg border border-ui-default bg-ui-app p-0.5">
        {tabs.map((t) => {
          const selected = t.id === active;
          const n = counts[t.id] ?? 0;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              disabled={t.disabled}
              onClick={() => onTab(t.id)}
              className={cn(
                "flex flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-caption font-medium transition-colors",
                selected ? "bg-ui-active text-ui-1" : "text-ui-4 enabled:hover:text-ui-1",
                t.disabled && "opacity-35"
              )}
            >
              {info?.[t.id]?.icon}
              {t.label}
              {n > 0 && <Count n={n} />}
            </button>
          );
        })}
      </div>
      {description && <p className="px-0.5 pt-2 text-[11.5px] leading-snug text-ui-hint">{description}</p>}
    </div>
  );
}

/** The footer: the dot legend. */
function Footer() {
  return (
    <footer className="flex h-10 shrink-0 items-center gap-2 border-t border-ui-subtle px-4">
      <Popover
        trigger={<CircleHelp className="h-4 w-4" />}
        triggerLabel="What the dots mean"
        triggerClassName="flex h-6 w-6 items-center justify-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1"
        side="top"
        className="w-64"
      >
        <DotLegend />
      </Popover>
      <span className="flex-1 text-caption text-ui-3">What the dots mean</span>
    </footer>
  );
}

/**
 * Each context's hand-opened sections, so the inspector reopens as it was left after the Library
 * or Sources page replaced it (a drag from the Library can then reach the section's drop slot).
 */
const handOpened = new Map<string, Record<string, boolean>>();

/**
 * The registry-driven inspector shared by every context, one column: the
 * header and the search, the tabs (hidden while searching), a line saying what
 * the search found, then accordion sections of field rows with the context's
 * custom UI; the Advanced switch decides which rows and cards show (`visibleSection`). A search
 * runs across every tab and lists every matching row.
 */
export function InspectorView({
  context,
  contextKey,
  header,
  fields,
  visible = always,
  present = always,
  parts,
  notes,
  inherit,
  query,
  onQuery,
  jumpTo,
  identity,
  quickKeys = [],
  searchable = true,
  footer,
  tabInfo,
  place,
  after,
  underline = false,
  tabLabels,
}: InspectorViewProps) {
  const { sources } = useSensorCatalog();
  const { sheet } = useInspectorChrome();
  const [accordion] = useAccordionPref();
  const [advanced, setAdvanced] = useAdvancedPref();
  const [storedTab, setTab] = useInspectorTab(contextKey);
  const root = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState<string | null>(null);
  /** Sections opened or closed by hand (the rest follow the default), kept over a remount. */
  const [openMap, setOpenState] = useState<Record<string, boolean>>(() => handOpened.get(contextKey) ?? {});
  const setOpenMap = (fn: (m: Record<string, boolean>) => Record<string, boolean>) =>
    setOpenState((m) => {
      const next = fn(m);
      handOpened.set(contextKey, next);
      return next;
    });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const searching = searchable && query.trim() !== "";
  const filtering = searching;
  const all = visibleSections(allSections(context), visible).filter(present);
  const tabs = tabStates(inspectorTabs(context), all).map((t) => (tabLabels?.[t.id] ? { ...t, label: tabLabels[t.id]! } : t));
  const tab = pickTab(
    storedTab,
    tabs.map((t) => t.id),
    new Set(tabs.filter((t) => t.disabled).map((t) => t.id))
  );
  const full = new Map(all.map((s) => [s.id, s] as const));
  /** How Advanced shapes a section outside search (its chip's mode decides a collapse). */
  const shapeOf = (s: InspectorSection) => visibleSection(s, { advanced, mode: inherit?.(full.get(s.id) ?? s)?.mode });
  const shown = all.filter((s) => !shapeOf(s).hidden);

  const changedOf = (s: InspectorSection) => changedCount(s, fields.values) + (parts(s).changed ?? 0);
  const counts: Partial<Record<TabId, number>> = {};
  for (const s of all) counts[s.tab] = (counts[s.tab] ?? 0) + changedOf(s);
  const ownAll = all.reduce((n, s) => n + changedOf(s), 0);

  // A search: every tab's matches.
  const result = searching ? searchAll(context, query) : null;
  const matched = result
    ? visibleSections(
        result.groups.map((g) => ({ ...g.section, extras: g.section.extras.filter((e) => extraMatches(e, query)) })),
        visible
      ).filter(present)
    : tabs.length === 0
      ? shown
      : shown.filter((s) => s.tab === tab);
  const sections = matched;
  const tabLabel = (s: InspectorSection) =>
    tabs.length === 0 ? "" : (result?.groups.find((g) => g.section.id === s.id)?.tabLabel ?? TAB_LABELS[s.tab]);
  const shownCount = sections.reduce((n, s) => n + s.settings.length, 0);

  // Accordion: the editor section (a selected panel widget) or the tab's first is open by default.
  const editorId = sections.find((s) => parts(s).editor)?.id;
  const defaultOpen = editorId ?? sections[0]?.id;
  const isOpen = (s: InspectorSection) => openMap[s.id] ?? s.id === defaultOpen;
  const openOnly = (id: string, map: Record<string, boolean>) =>
    accordion === "one"
      ? { ...map, ...Object.fromEntries(sections.map((s) => [s.id, s.id === id])) }
      : { ...map, [id]: true };
  const toggle = (s: InspectorSection) => setOpenMap((m) => (isOpen(s) ? { ...m, [s.id]: false } : openOnly(s.id, m)));

  // A panel widget picked on the canvas opens its editor section.
  useEffect(() => {
    if (editorId) setOpenMap((m) => openOnly(editorId, m));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorId]);

  const lastJump = useRef(jumpTo?.seq);
  useEffect(() => {
    if (!jumpTo || jumpTo.seq === lastJump.current) return;
    lastJump.current = jumpTo.seq;
    const target = jumpTarget(all, jumpTo.id);
    if (!target) return;
    if (needsAdvanced(target, jumpTo.key, inherit?.(full.get(target.id) ?? target)?.mode)) showAdvanced();
    if (tabs.length > 0) setTab(target.tab);
    setOpenMap((m) => (accordion === "one" ? { [target.id]: true } : { ...m, [target.id]: true }));
    // The tab renders first, then the section scrolls into view.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const card = root.current?.querySelector(`[${SETTING_CARD}="${CSS.escape(target.id)}"]`);
        card?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
        // "Go to setting" also puts the cursor in the field.
        if (jumpTo.key)
          card
            ?.querySelector<HTMLElement>(`[data-setting-key="${CSS.escape(jumpTo.key)}"] :is(input, select, textarea, button)`)
            ?.focus({ preventScroll: true });
      })
    );
    setFlash(target.id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(null), FLASH_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo?.seq]);

  const resetSection = (whole: InspectorSection) => {
    const keys = resetKeysOfSection(whole, fields.values);
    if (keys.length > 0) fields.onClear(keys);
    parts(whole).onReset?.();
  };

  const pad = (node: ReactNode) => node && <SectionPad>{node}</SectionPad>;

  const renderSection = (s: InspectorSection) => {
    const p = parts(s);
    const whole = full.get(s.id) ?? s;
    // Filtering lists every matching row; otherwise Advanced decides (`visibleSection`).
    const shape = filtering ? undefined : shapeOf(s);
    const rows = shape ? shape.rows : s.settings;
    const collapsed = shape?.collapsed;
    const field = (def: ModuleSetting) => <SettingField key={def.key} def={def} fields={fields} sources={sources} />;
    const inh = inherit?.(whole);
    if (p.plain)
      return (
        <section key={s.id} {...{ [SETTING_CARD]: s.id }} className="border-b border-s-divider px-4 pb-3.5 pt-3">
          {p.body}
        </section>
      );
    return (
      <SettingSection
        key={s.id}
        id={s.id}
        title={s.title}
        icon={sectionIcon(s)}
        tabLabel={tabLabel(s) || undefined}
        changed={changedOf(whole)}
        pill={p.pill}
        chip={inh?.chip}
        onKeyDown={inh?.onKeyDown}
        actions={p.actions}
        onReset={() => resetSection(whole)}
        open={isOpen(s)}
        onToggle={() => toggle(s)}
        filtering={filtering}
        editor={p.editor}
        flash={flash === s.id}
      >
        {inh?.note && pad(inh.note)}
        {collapsed === "theme" && inh ? (
          <FollowsTheme onCustomise={inh.onCustomise} />
        ) : (
          <>
            {pad(p.top)}
            {rows.map(field)}
            {pad(p.body)}
            {pad(p.bottom)}
            {(filtering || advanced) && pad(p.more)}
          </>
        )}
        {inh && collapsed !== "theme" && pad(inh.actions)}
      </SettingSection>
    );
  };

  // The phone sheet below full height: the compact header, the tool strip and one tool's fields.
  if (sheet && sheet.snap !== "full")
    return (
      <SheetView
        sheet={sheet}
        identity={identity}
        sections={shown}
        advanced={advanced}
        parts={parts}
        inherit={inherit ? (section) => inherit(full.get(section.id) ?? section) : undefined}
        changedOf={changedOf}
        changed={ownAll}
        fields={fields}
        sources={sources}
        quickKeys={quickKeys}
      />
    );

  const empty = searching && sections.length === 0 && `No settings match “${query.trim()}”.`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div data-inspector-header="" className="shrink-0 space-y-2.5 pb-2.5 pl-4 pr-3 pt-3">
        {typeof header === "function" ? header(ownAll) : header}
      </div>
      {place}
      {searchable && (
        <div className="flex shrink-0 gap-1.5 pb-2.5 pl-4 pr-3">
          <div className="min-w-0 flex-1">
            <SettingsSearch query={query} onQuery={onQuery} />
          </div>
          <label
            title="Show every setting, including ones the theme controls"
            className="flex shrink-0 cursor-pointer items-center gap-1.5 text-caption text-ui-2"
          >
            Advanced
            <Toggle checked={advanced} onChange={setAdvanced} label="Advanced" />
          </label>
        </div>
      )}
      {!filtering && tabs.length > 0 && <Tabs tabs={tabs} active={tab} counts={counts} onTab={setTab} info={tabInfo} underline={underline} />}
      {filtering && (
        <div className="flex shrink-0 items-center gap-2 pb-2 pl-4 pr-3 text-[11.5px] text-ui-hint">
          <span className="flex-1">{`${shownCount} matching setting${shownCount === 1 ? "" : "s"}`}</span>
        </div>
      )}
      <div className="h-px shrink-0 bg-ui-subtle" />
      <div {...{ [INSPECTOR_SCROLL]: "" }} ref={root} className="min-h-0 flex-1 overflow-y-auto pb-3">
        {!filtering && notes?.(tab)}
        {empty && <p className="px-4 py-6 text-[12.5px] text-ui-hint">{empty}</p>}
        {sections.map(renderSection)}
        {after}
      </div>
      {footer === undefined ? <Footer /> : footer}
    </div>
  );
}
