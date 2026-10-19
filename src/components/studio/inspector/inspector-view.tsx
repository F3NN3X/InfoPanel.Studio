import { useEffect, useRef, useState, type ReactNode } from "react";
import { CircleHelp, History } from "lucide-react";
import { Popover } from "@/components/ui/popover";
import { useSensorCatalog } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { isMore, type ModuleSetting } from "@/modules/types";
import { INSPECTOR_SCROLL, useInspectorChrome } from "../inspector-layout";
import {
  allSections,
  changedCount,
  changedSettings,
  extraMatches,
  inspectorTabs,
  jumpTarget,
  resetKeysOfSection,
  searchAll,
  splitMore,
  tabStates,
  visibleSections,
  TAB_LABELS,
  type InspectorContext,
  type InspectorSection,
  type TabId,
} from "../inspector-model";
import { SETTING_CARD, SettingSection } from "../setting-card";
import { SettingField, type FieldsApi } from "../settings-panel";
import { SettingsSearch } from "../zone-inspector-parts";
import { pickTab, useAccordionPref, useInspectorTab } from "./inspector-prefs";
import { MoreRows, moreKey, setMoreOpen } from "./more-rows";
import { sectionIcon } from "./section-icons";
import { SheetView, type SheetIdentity } from "./sheet-view";
import { FollowBar, FollowPill } from "./follow-bar";
import { DotLegend } from "./source-dot";

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
  /** Whose sections' More rows stay open together for the session (the zone type); default `contextKey`. */
  moreScope?: string;
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
  query: string;
  onQuery: (query: string) => void;
  /** Only the values set here, across every tab. */
  changedOnly: boolean;
  onChangedOnly: (on: boolean) => void;
  /** Open, reveal and outline a section whenever `seq` changes. */
  jumpTo?: { id: string; key?: string; seq: number };
  /** The phone sheet's compact header (below full height). */
  identity: SheetIdentity;
  /** The sheet's Quick tool: the pinned settings, in order. */
  quickKeys?: readonly string[];
  /** A Follow bar's theme name: open the theme being followed. */
  onTheme?: (level: "profile" | "page") => void;
}

/** How long a jumped-to section stays outlined. */
const FLASH_MS = 1200;

const always = () => true;

/** A note or banner above the sections. */
export function InspectorNote({ children }: { children: ReactNode }) {
  return (
    <div className="mx-4 mb-1 mt-3 rounded-lg border border-ui-default bg-ui-raised px-3 py-2.5 text-[12px] leading-snug text-ui-2">
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
}: {
  tabs: { id: TabId; label: string; disabled: boolean }[];
  active: TabId | undefined;
  counts: Partial<Record<TabId, number>>;
  onTab: (tab: TabId) => void;
}) {
  return (
    <div className="shrink-0 pb-2.5 pl-4 pr-3">
      <div role="tablist" className="flex flex-wrap gap-0.5 rounded-lg border border-ui-default bg-ui-app p-0.5">
        {tabs.map((t) => {
          const selected = t.id === active;
          const n = counts[t.id] ?? 0;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={t.disabled}
              onClick={() => onTab(t.id)}
              className={cn(
                "flex flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors",
                selected ? "bg-ui-active text-ui-1" : "text-[#8f8f99] enabled:hover:text-ui-1",
                t.disabled && "opacity-35"
              )}
            >
              {t.label}
              {n > 0 && <Count n={n} />}
            </button>
          );
        })}
      </div>
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
      <span className="flex-1 text-[12px] text-ui-3">What the dots mean</span>
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
 * header, search and the Changed filter on one row, the tabs (hidden while
 * filtering), a line saying what the filter found, then accordion sections
 * of field rows with the context's custom UI, each closing with its "More (n)"
 * rows. A search runs across every tab; Changed keeps only the values set
 * here, across every tab too. Both list More rows inline.
 */
export function InspectorView({
  context,
  contextKey,
  moreScope = contextKey,
  header,
  fields,
  visible = always,
  present = always,
  parts,
  notes,
  query,
  onQuery,
  changedOnly,
  onChangedOnly,
  jumpTo,
  identity,
  quickKeys = [],
  onTheme,
}: InspectorViewProps) {
  const { sources } = useSensorCatalog();
  const { sheet } = useInspectorChrome();
  const [accordion] = useAccordionPref();
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

  const searching = query.trim() !== "";
  const filtering = searching || changedOnly;
  const all = visibleSections(allSections(context), visible).filter(present);
  const tabs = tabStates(inspectorTabs(context), all);
  const tab = pickTab(
    storedTab,
    tabs.map((t) => t.id),
    new Set(tabs.filter((t) => t.disabled).map((t) => t.id))
  );
  const full = new Map(all.map((s) => [s.id, s] as const));

  const changedOf = (s: InspectorSection) => changedCount(s, fields.values) + (parts(s).changed ?? 0);
  const counts: Partial<Record<TabId, number>> = {};
  for (const s of all) counts[s.tab] = (counts[s.tab] ?? 0) + changedOf(s);
  const ownAll = all.reduce((n, s) => n + changedOf(s), 0);

  // A search: every tab's matches. Changed: every tab's sections with values set here.
  const result = searching ? searchAll(context, query) : null;
  const matched = result
    ? visibleSections(
        result.groups.map((g) => ({ ...g.section, extras: g.section.extras.filter((e) => extraMatches(e, query)) })),
        visible
      ).filter(present)
    : changedOnly || tabs.length === 0
      ? all
      : all.filter((s) => s.tab === tab);
  // Changed keeps a section's own values (and custom UI that holds some).
  const sections = changedOnly
    ? matched
        .filter((s) => changedOf(full.get(s.id) ?? s) > 0)
        .map((s) => ({ ...s, settings: changedSettings(s, fields.values) }))
    : matched;
  const tabLabel = (s: InspectorSection) =>
    tabs.length === 0 ? "" : (result?.groups.find((g) => g.section.id === s.id)?.tabLabel ?? TAB_LABELS[s.tab]);
  const shownCount = sections.reduce(
    (n, s) => n + s.settings.length + (changedOnly ? (parts(full.get(s.id) ?? s).changed ?? 0) : 0),
    0
  );

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
    if (target.settings.some((d) => d.key === jumpTo.key && isMore(d))) setMoreOpen(moreKey(moreScope, target.id), true);
    if (tabs.length > 0) setTab(target.tab);
    if (changedOnly) onChangedOnly(false);
    setOpenMap((m) => (accordion === "one" ? { [target.id]: true } : { ...m, [target.id]: true }));
    // The tab renders first, then the section scrolls into view.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const card = root.current?.querySelector(`[${SETTING_CARD}="${CSS.escape(target.id)}"]`);
        card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
  /** Changed's "Reset all": every value set here, on every tab. */
  const resetAll = () => {
    const keys = all.flatMap((s) => resetKeysOfSection(s, fields.values));
    if (keys.length > 0) fields.onClear(keys);
    for (const s of all) if ((parts(s).changed ?? 0) > 0) parts(s).onReset?.();
  };

  const pad = (node: ReactNode) => node && <div className="space-y-2 py-1 pl-4 pr-2.5">{node}</div>;

  const renderSection = (s: InspectorSection) => {
    const p = parts(s);
    const whole = full.get(s.id) ?? s;
    // In the Changed view custom UI shows only while it holds values set here.
    const custom = !changedOnly || (p.changed ?? 0) > 0;
    // Filtering lists More rows inline; otherwise they follow the section's "More (n)".
    const split = splitMore(s);
    const field = (def: ModuleSetting) => <SettingField key={def.key} def={def} fields={fields} sources={sources} />;
    const bar = fields.follow?.(whole);
    if (p.plain)
      return (
        <section key={s.id} {...{ [SETTING_CARD]: s.id }} className="border-b border-[#1c1c21] px-4 pb-3.5 pt-3">
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
        pill={bar && <FollowPill mode={bar.mode} scope={bar.scope?.kind} />}
        actions={p.actions}
        onReset={() => resetSection(whole)}
        open={isOpen(s)}
        onToggle={() => toggle(s)}
        filtering={filtering}
        editor={p.editor}
        flash={flash === s.id}
      >
        {!changedOnly && bar && pad(<FollowBar bar={bar} onTheme={onTheme} />)}
        {!changedOnly && pad(p.top)}
        {(filtering ? s.settings : split.rows).map(field)}
        {custom && pad(p.body)}
        {custom && pad(p.bottom)}
        {filtering ? (
          custom && pad(p.more)
        ) : (
          <MoreRows storeKey={moreKey(moreScope, s.id)} count={split.count}>
            {split.more.map(field)}
            {pad(p.more)}
          </MoreRows>
        )}
      </SettingSection>
    );
  };

  // The phone sheet below full height: the compact header, the tool strip and one tool's fields.
  if (sheet && sheet.snap !== "full")
    return (
      <SheetView
        sheet={sheet}
        identity={identity}
        sections={all}
        moreScope={moreScope}
        parts={parts}
        changedOf={changedOf}
        changed={ownAll}
        fields={fields}
        sources={sources}
        quickKeys={quickKeys}
      />
    );

  const empty = searching
    ? sections.length === 0 && `No settings match “${query.trim()}”.`
    : changedOnly && sections.length === 0 && "Nothing changed yet. Everything uses its default.";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div data-inspector-header="" className="shrink-0 space-y-2.5 pb-2.5 pl-4 pr-3 pt-3">
        {typeof header === "function" ? header(ownAll) : header}
      </div>
      <div className="flex shrink-0 gap-1.5 pb-2.5 pl-4 pr-3">
        <div className="min-w-0 flex-1">
          <SettingsSearch query={query} onQuery={onQuery} />
        </div>
        <button
          type="button"
          aria-pressed={changedOnly}
          onClick={() => onChangedOnly(!changedOnly)}
          title="Show only what you changed"
          className={cn(
            "flex h-8 shrink-0 items-center gap-[5px] whitespace-nowrap rounded-[7px] border px-[9px] text-[12px] font-medium transition-colors",
            changedOnly
              ? "border-ui-accent/50 bg-ui-accent/[.16] text-[oklch(0.86_0.10_255)]"
              : "border-ui-default bg-ui-app text-ui-2 hover:text-ui-1"
          )}
        >
          <History className="h-4 w-4" />
          Changed
          <span className="font-ui-mono text-[11px]">{ownAll}</span>
        </button>
      </div>
      {!filtering && tabs.length > 0 && <Tabs tabs={tabs} active={tab} counts={counts} onTab={setTab} />}
      {filtering && (
        <div className="flex shrink-0 items-center gap-2 pb-2 pl-4 pr-3 text-[11.5px] text-[#8a8a94]">
          <span className="flex-1">
            {searching
              ? `${shownCount} matching setting${shownCount === 1 ? "" : "s"}${changedOnly ? " (changed only)" : ""}`
              : `${shownCount} changed setting${shownCount === 1 ? "" : "s"}`}
          </span>
          {changedOnly && ownAll > 0 && (
            <button type="button" onClick={resetAll} className="font-medium text-[oklch(0.80_0.12_255)] hover:underline">
              Reset all
            </button>
          )}
        </div>
      )}
      <div className="h-px shrink-0 bg-ui-subtle" />
      <div {...{ [INSPECTOR_SCROLL]: "" }} ref={root} className="min-h-0 flex-1 overflow-y-auto pb-3">
        {!filtering && notes?.(tab)}
        {empty && <p className="px-4 py-6 text-[12.5px] text-[#8a8a94]">{empty}</p>}
        {sections.map(renderSection)}
      </div>
      <Footer />
    </div>
  );
}
