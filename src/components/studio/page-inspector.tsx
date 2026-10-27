import { useState, type ReactNode } from "react";
import { Cast, CircleHelp, Copy, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import type { MonitorProfile, PageLayout, ProfilePage } from "@/lib/layout";
import { SECTION_IDS, type SectionId } from "@/lib/theme-model";
import { cn } from "@/lib/utils";
import { sectionIconById } from "./inspector/section-icons";
import { LayoutControl } from "./layout-control";
import { LinkRow } from "./link-row";
import { pageIcon } from "./page-icons";
import { cycleLabel, layoutOf } from "./page-tabs";
import { sectionInherit } from "./section-inherit";
import { sectionTitle } from "./theme-editor-model";
import type { InheritanceContext } from "./use-inheritance";
import { CloseButton, HeaderIcon } from "./zone-inspector-parts";

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
  onHelp: () => void;
  /** Layout (one-editor SPEC §6.1): switch the page to Grid or Free, one undo step. */
  onLayout?: (id: string, layout: PageLayout) => void;
  /** Why the page can't switch (its content isn't loaded yet). */
  layoutDisabled?: string;
}

const SECTION_LABEL = "text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ui-4";
const ACTION =
  "flex h-8 items-center justify-center gap-1.5 rounded-[7px] border border-ui-strong bg-ui-raised px-3 text-[12.5px] font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1 disabled:pointer-events-none disabled:opacity-40";

/** The rotation LinkRow's value: "Included · every 20 s", "Not included", "Rotation off". */
function rotationText(profile: MonitorProfile, page: ProfilePage): string {
  const rotate = profile.rotate;
  if (!rotate?.enabled) return "Rotation off";
  const included = !rotate.pages || rotate.pages.length === 0 || rotate.pages.includes(page.id);
  return included ? `Included · every ${cycleLabel(rotate.seconds)}` : "Not included";
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
    <label className="flex min-h-7 items-center gap-2.5 text-[12px] text-ui-3">
      <span className="w-12 shrink-0">Name</span>
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
        className="h-7 min-w-0 flex-1 rounded-md border border-ui-strong bg-ui-app px-2 text-[12.5px] text-ui-1 outline-none focus:border-ui-accent"
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
      <Icon className="h-4 w-4 shrink-0 text-[#7c7c86]" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ui-1">{sectionTitle(section)}</span>
      {chip}
    </li>
  );
}

function Block({ label, children, labelClassName }: { label: string; children: ReactNode; labelClassName?: string }) {
  return (
    <section className="space-y-2 border-b border-[#1c1c21] px-4 py-3">
      <h3 className={cn(SECTION_LABEL, labelClassName)}>{label}</h3>
      {children}
    </section>
  );
}

/**
 * The inspector with nothing selected (SPEC §6.4): the page being edited. Its Name and Icon, the Rotation
 * LinkRow (Screens owns order and rotation), the sections the page customises over its screen's theme with the
 * way into Theme at page scope, LIVE "Show on kiosks now", and Duplicate / Delete page.
 */
export function PageInspector({ profile, page, inherit, onRename, onIcon, onDuplicate, onDelete, onShowOnKiosks, onHelp, onLayout, layoutDisabled }: PageInspectorProps) {
  const Icon = pageIcon(page.icon);
  const custom = SECTION_IDS.filter((sec) => page.widgetTheme?.follow?.[sec] === false);
  const zones = page.placements.length;
  const pageScope = { kind: "page", pageId: page.id } as const;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div data-inspector-header="" className="flex shrink-0 items-center gap-2.5 pb-2.5 pl-4 pr-3 pt-3">
        <HeaderIcon>{Icon ? <Icon /> : <Cast />}</HeaderIcon>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold leading-4 text-ui-1">Page · {page.name}</div>
          <div className="truncate text-[11px] text-[#8a8a94]">
            {profile.name} · {zones} {zones === 1 ? "zone" : "zones"}
          </div>
        </div>
        <IconButton label="Help (F1)" onClick={onHelp}>
          <CircleHelp className="h-4 w-4" />
        </IconButton>
        <CloseButton />
      </div>
      <div className="h-px shrink-0 bg-ui-subtle" />
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        {onLayout && (
          <Block label="Layout">
            <LayoutControl layout={layoutOf(profile, page)} onChange={(to) => onLayout(page.id, to)} disabled={layoutDisabled} />
          </Block>
        )}
        <section className="space-y-1 border-b border-[#1c1c21] px-4 py-3">
          <NameRow key={`${page.id}:${page.name}`} page={page} onRename={(name) => onRename(page.id, name)} />
          <div className="flex min-h-7 items-center gap-2.5 text-[12px] text-ui-3">
            <span className="w-12 shrink-0">Icon</span>
            <button
              type="button"
              onClick={() => onIcon(page.id)}
              className="flex h-7 items-center gap-1.5 rounded-md border border-ui-strong bg-ui-app px-2 text-[12.5px] text-ui-1 hover:bg-ui-hover"
            >
              {Icon ? <Icon className="h-4 w-4" /> : null}
              {page.icon ?? "None"}
            </button>
          </div>
          <LinkRow
            label="Rotation"
            value={rotationText(profile, page)}
            note="Page order and rotation live in"
            link="Screens"
            onNavigate={() => inherit.navigateTo({ view: "screens", profileId: profile.id, section: "rotation" })}
          />
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
              Customise a section…
            </button>
          </p>
        </Block>

        <Block label="Live" labelClassName="text-[oklch(0.88_0.10_150)]">
          <button
            type="button"
            onClick={onShowOnKiosks}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-[7px] border border-[oklch(0.78_0.15_150/0.45)] bg-[oklch(0.78_0.15_150/0.12)] text-[12.5px] font-medium text-[oklch(0.88_0.10_150)] transition-colors hover:bg-[oklch(0.78_0.15_150/0.2)]"
          >
            <Cast className="h-4 w-4" strokeWidth={1.75} /> Show on kiosks now
          </button>
          <p className="mt-1.5 text-pretty text-[11px] leading-[1.4] text-ui-4">
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
