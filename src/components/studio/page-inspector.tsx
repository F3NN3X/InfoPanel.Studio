import { useState, type ReactNode } from "react";
import { Cast, Copy, Trash2 } from "lucide-react";
import type { MonitorProfile, ProfilePage } from "@/lib/layout";
import { profileGap } from "@/lib/profile-grid";
import { resolveTheme } from "@/lib/theme";
import { themeState } from "@/lib/theme-state";
import { SECTION_IDS, type SectionId } from "@/lib/theme-model";
import { cn } from "@/lib/utils";
import { sectionIconById } from "./inspector/section-icons";
import { sizeChoice, sizeOfChoice, sizeOptions } from "./inspector/profile-grid";
import { ColsRows, NumberInput, PageHeader, PageRow, SnapSection } from "./page-settings-parts";
import { pageIcon } from "./page-icons";
import { cycleLabel } from "./page-tabs";
import { sectionInherit } from "./section-inherit";
import { sectionTitle } from "./theme-editor-model";
import { themeLabel } from "./theme-view-model";
import type { InheritanceContext } from "./use-inheritance";

interface PageInspectorProps {
  profile: MonitorProfile;
  page: ProfilePage;
  inherit: InheritanceContext;
  onRename: (id: string, name: string) => void;
  /** Open the page's icon picker. */
  onIcon: (id: string) => void;
  onDuplicate: (id: string) => void;
  /** Ask to delete (the page tabs confirm it). */
  onDelete: (id: string) => void;
  /** LIVE: send the kiosks to this page now (runtime, never saved). */
  onShowOnKiosks: () => void;
  /** Snap items to grid (Edit v3 SPEC §10.1), one undo step. */
  onSnapItems: (on: boolean) => void;
  /** The screen's size, Columns × rows (refused when a widget wouldn't fit, decision Q5) and gap. */
  onSize: (width: number, height: number) => void;
  onGrid: (cols: number, rows: number) => void;
  onGap: (gap: number) => void;
}

const SECTION_LABEL = "text-micro font-semibold uppercase tracking-[0.06em] text-ui-4";
const SELECT = "h-7 max-w-[150px] rounded-md border border-ui-default bg-ui-app px-1.5 font-ui-mono text-caption text-ui-1 outline-none focus:border-ui-accent";
const ACTION =
  "flex h-8 items-center justify-center gap-1.5 rounded-[7px] border border-ui-strong bg-ui-raised px-3 text-[12.5px] font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1 disabled:pointer-events-none disabled:opacity-40";

/** The rotation LinkRow's value: "Included · every 20 s", "Not included", "Rotation off". */
function rotationText(profile: MonitorProfile, page: ProfilePage): string {
  const rotate = profile.rotate;
  if (!rotate?.enabled) return "Rotation off";
  const included = !rotate.pages || rotate.pages.length === 0 || rotate.pages.includes(page.id);
  return included ? `Included · every ${cycleLabel(rotate.seconds)}` : "Not included";
}

/**
 * The screen's theme by name, from the snapshot of the theme it last applied, and a swatch. A screen with a look but
 * no snapshot is a custom look.
 */
function themeOf(inherit: InheritanceContext, profile: MonitorProfile): { name: string; swatch: string } {
  const state = themeState(inherit.config, { kind: "profile", profileId: profile.id });
  return { name: themeLabel(state), swatch: `hsl(${resolveTheme(profile).tokens.background})` };
}

/** The page's Name: committed on Enter or blur, so a rename is one undo step. */
function NameRow({ page, onRename }: { page: ProfilePage; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(page.name);
  const commit = () => {
    const name = draft.trim();
    if (name && name !== page.name) onRename(name);
    else setDraft(page.name);
  };
  return (
    <label className="flex min-h-7 items-center justify-between gap-2.5 text-caption text-ui-4">
      <span className="shrink-0">Name</span>
      <input
        value={draft}
        aria-label="Page name"
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(page.name);
            e.currentTarget.blur();
          }
        }}
        className="h-7 min-w-0 max-w-[170px] flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-right text-caption text-ui-1 outline-none hover:border-ui-default focus:border-ui-accent"
      />
    </label>
  );
}

/** One section the page customises: its icon and name, and the `Custom here` chip (Reset, Edit in Theme). */
function LookCard({ section, profile, page, inherit }: { section: SectionId; profile: MonitorProfile; page: ProfilePage; inherit: InheritanceContext }) {
  const Icon = sectionIconById(section === "palette" ? "colors" : section);
  const scope = { level: "page", profileId: profile.id, pageId: page.id } as const;
  const { chip } = sectionInherit({ sections: [section], title: sectionTitle(section), scope, ctx: inherit });
  return (
    <li className="flex h-9 items-center gap-2 rounded-lg border border-ui-default bg-ui-raised pl-2.5 pr-2">
      <Icon className="h-4 w-4 shrink-0 text-ui-hint" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ui-1">{sectionTitle(section)}</span>
      {chip}
    </li>
  );
}

function Block({ label, children, labelClassName }: { label: string; children: ReactNode; labelClassName?: string }) {
  return (
    <section className="space-y-2 border-b border-s-divider px-4 py-3">
      <h3 className={cn(SECTION_LABEL, labelClassName)}>{label}</h3>
      {children}
    </section>
  );
}

/**
 * The inspector with nothing selected (Edit v3 SPEC §10.1): the page being edited. GRID with Snap items to grid and
 * the Alt hint; Name, Size, Columns × rows, Gap, Theme and Rotation (Screens keeps the rest of the screen's settings,
 * the breadcrumb's Screen settings…); then the page's Icon, the sections it customises over its screen's theme, LIVE
 * "Show on kiosks now", and Duplicate / Delete page.
 */
export function PageInspector({ profile, page, inherit, onRename, onIcon, onDuplicate, onDelete, onShowOnKiosks, onSnapItems, onSize, onGrid, onGap }: PageInspectorProps) {
  const Icon = pageIcon(page.icon);
  const custom = SECTION_IDS.filter((sec) => page.widgetTheme?.follow?.[sec] === false);
  const pageScope = { kind: "page", pageId: page.id } as const;
  const theme = themeOf(inherit, profile);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader name={page.name} />
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        <SnapSection snapItems={page.snapItems !== false} onSnapItems={onSnapItems} />
        <section className="flex flex-col gap-1.5 border-b border-s-divider px-3.5 py-3">
          <NameRow key={`${page.id}:${page.name}`} page={page} onRename={(name) => onRename(page.id, name)} />
          <PageRow label="Size">
            <select
              aria-label="Size"
              value={sizeChoice(profile.width, profile.height)}
              onChange={(e) => {
                const size = sizeOfChoice(e.target.value);
                if (size) onSize(size.width, size.height);
              }}
              className={SELECT}
            >
              {sizeOptions(profile.width, profile.height).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label.replace("×", " × ")}
                </option>
              ))}
            </select>
          </PageRow>
          <ColsRows cols={profile.cols} rows={profile.rows} onGrid={onGrid} />
          <PageRow label="Gap">
            <NumberInput label="Gap" value={profile.gap ?? profileGap(profile)} min={0} max={64} onCommit={onGap} />
            <span className="text-ui-4">px</span>
          </PageRow>
          <PageRow label="Theme" swatch={theme.swatch}>
            <button
              type="button"
              title="Edit in Theme"
              onClick={() => inherit.navigateTo({ view: "theme", themeScope: { kind: "profile" }, profileId: profile.id })}
              className="truncate rounded-sm hover:underline"
            >
              {theme.name}
            </button>
          </PageRow>
          <PageRow label="Rotation">
            <button
              type="button"
              title="Page order and rotation live in Screens"
              onClick={() => inherit.navigateTo({ view: "screens", profileId: profile.id, section: "rotation" })}
              className="truncate rounded-sm hover:underline"
            >
              {rotationText(profile, page)}
            </button>
          </PageRow>
          <div className="flex min-h-7 items-center justify-between gap-2.5 text-caption text-ui-4">
            <span className="shrink-0">Icon</span>
            <button
              type="button"
              onClick={() => onIcon(page.id)}
              className="flex h-7 items-center gap-1.5 rounded-md border border-ui-default bg-ui-app px-2 text-caption text-ui-1 hover:bg-ui-hover"
            >
              {Icon ? <Icon className="h-4 w-4" /> : null}
              {page.icon ?? "None"}
            </button>
          </div>
        </section>

        <Block label="This page's look">
          {custom.length > 0 && (
            <ul className="space-y-1.5">
              {custom.map((sec) => (
                <LookCard key={sec} section={sec} profile={profile} page={page} inherit={inherit} />
              ))}
            </ul>
          )}
          <p className="text-[11.5px] leading-snug text-ui-3">
            {custom.length > 0 ? `Everything else follows ${profile.name}.` : `This page follows ${profile.name} completely.`}
          </p>
          <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px]">
            <button
              type="button"
              onClick={() => inherit.navigateTo({ view: "theme", themeScope: pageScope, profileId: profile.id })}
              className="rounded-sm text-ui-accent-text hover:underline"
            >
              Edit in Theme ↗
            </button>
            <button
              type="button"
              onClick={() => inherit.navigateTo({ view: "theme", themeScope: pageScope, profileId: profile.id, section: "customise" })}
              className="rounded-sm text-ui-accent-text hover:underline"
            >
              Change a section…
            </button>
          </p>
        </Block>

        <Block label="Live" labelClassName="text-ui-ok-text">
          <button
            type="button"
            onClick={onShowOnKiosks}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-[7px] border border-[oklch(0.78_0.15_150/0.45)] bg-[oklch(0.78_0.15_150/0.12)] text-[12.5px] font-medium text-ui-ok-text transition-colors hover:bg-[oklch(0.78_0.15_150/0.2)]"
          >
            <Cast className="h-4 w-4" strokeWidth={1.75} /> Show on kiosks now
          </button>
          <p className="mt-1.5 text-pretty text-micro leading-[1.4] text-ui-4">
            Switches the kiosks to this page right away. Not part of your design, so Save doesn't change it.
          </p>
        </Block>

        <Block label="Actions">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={ACTION} onClick={() => onDuplicate(page.id)}>
              <Copy className="h-3.5 w-3.5" /> Duplicate page
            </button>
            <button
              type="button"
              className={cn(ACTION, "text-ui-danger hover:text-ui-danger")}
              disabled={profile.pages.length <= 1}
              title={profile.pages.length <= 1 ? "A screen keeps at least one page" : undefined}
              onClick={() => onDelete(page.id)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete page
            </button>
          </div>
        </Block>
      </div>
    </div>
  );
}
