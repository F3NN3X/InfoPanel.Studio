import type { ReactNode } from "react";
import { Eye, EyeOff, SlidersHorizontal, Zap } from "lucide-react";
import type { ApiSources } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import type { ModuleSetting } from "@/modules/types";
import { splitMore, type InspectorSection } from "../inspector-model";
import { INSPECTOR_SCROLL, type SheetChrome } from "../inspector-layout";
import { SettingField, type FieldsApi } from "../settings-panel";
import { sectionIcon, sectionShort } from "./section-icons";
import type { SectionInherit, SectionParts } from "./inspector-view";
import { MoreRows, moreKey } from "./more-rows";

/** What the sheet's compact header shows (peek and half). */
export interface SheetIdentity {
  icon: ReactNode;
  name: string;
  /** The sub line for a count of own values. */
  meta: (changed: number) => string;
  /** Every zone is hidden (the eye is crossed out). */
  hidden?: boolean;
  /** The visibility button; omitted for the dashboard. */
  onToggleVisible?: () => void;
  /** Shown alone at the peek instead of the header and the strip ("Tap a widget to edit it."). */
  peekNote?: string;
}

interface SheetViewProps {
  sheet: SheetChrome;
  identity: SheetIdentity;
  /** The sections a tile can show, in tab order. */
  sections: InspectorSection[];
  parts: (section: InspectorSection) => SectionParts;
  /** The section's inheritance chip, as on its full card. */
  inherit?: (section: InspectorSection) => SectionInherit | undefined;
  changedOf: (section: InspectorSection) => number;
  /** All own values (the sub line). */
  changed: number;
  fields: FieldsApi;
  sources: ApiSources | null;
  /** The Quick tile's settings (the pinned set), in order. */
  quickKeys: readonly string[];
  /** Whose More rows open together (the zone type, as in the full inspector). */
  moreScope: string;
}

const BUTTON = "flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-ui-3 hover:bg-[#1e1e24] hover:text-ui-1";

/** A 44 px button that opens the full inspector. */
function AllSettings({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title="All settings" aria-label="All settings" className={BUTTON}>
      <SlidersHorizontal className="h-5 w-5" />
    </button>
  );
}

/** One 72×60 tool tile: icon and a one-word label, a dot when the section has changes. */
function Tile({
  icon,
  label,
  active,
  dot,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  dot: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex h-[60px] w-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-[10px] border text-[10.5px] font-medium [&>svg]:h-5 [&>svg]:w-5",
        active ? "border-ui-accent/60 bg-ui-accent/[.14] text-ui-1" : "border-ui-default text-ui-3 hover:text-ui-1"
      )}
    >
      {icon}
      <span className="max-w-full truncate px-1">{label}</span>
      {dot && <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-ui-accent" />}
    </button>
  );
}

/**
 * The bottom sheet at its peek and half heights: a compact header (name,
 * visibility, all settings), a strip of tool tiles (Quick, then one per
 * section across every tab) and, at half, the chosen tool's fields without
 * a section header. At full height the sheet shows the whole inspector.
 */
export function SheetView({ sheet, identity, sections, parts, inherit, changedOf, changed, fields, sources, quickKeys, moreScope }: SheetViewProps) {
  const toFull = () => sheet.setSnap("full");
  if (identity.peekNote && sheet.snap === "peek")
    return (
      <div className="flex min-h-0 flex-1 items-center gap-2 pb-2 pl-4 pr-2">
        <p className="flex-1 text-[13px] text-ui-3">{identity.peekNote}</p>
        <AllSettings onClick={toFull} />
      </div>
    );

  // The tool persists across selections while the new zone has it; otherwise Quick.
  const active = sections.find((s) => s.id === sheet.tool);
  const pick = (id: string) => {
    sheet.setTool(id);
    if (sheet.snap === "peek") sheet.setSnap("half");
  };
  const quick = quickKeys.flatMap((key) =>
    sections.flatMap((s) => s.settings.filter((d) => d.key === key)).slice(0, 1)
  );

  const body = () => {
    if (!active)
      return quick.length > 0 ? (
        quick.map((def) => <SettingField key={def.key} def={def} fields={fields} sources={sources} />)
      ) : (
        <p className="px-4 py-4 text-[12.5px] text-[#8a8a94]">Pin settings from the panel to show them here</p>
      );
    const p = parts(active);
    const inh = inherit?.(active);
    const pad = (node: ReactNode) => node && <div className="space-y-2 py-1 pl-4 pr-2.5">{node}</div>;
    if (p.plain) return <div className="px-4 py-3">{p.body}</div>;
    const split = splitMore(active);
    const field = (def: ModuleSetting) => <SettingField key={def.key} def={def} fields={fields} sources={sources} />;
    return (
      <>
        {inh && (
          <div className="flex min-h-11 items-center gap-2 pl-4 pr-2.5" onKeyDown={inh.onKeyDown}>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ui-1">{active.title}</span>
            {inh.chip}
          </div>
        )}
        {inh?.note && pad(inh.note)}
        {pad(p.top)}
        {split.rows.map(field)}
        {pad(p.body)}
        {pad(p.bottom)}
        <MoreRows storeKey={moreKey(moreScope, active.id)} count={split.count}>
          {split.more.map(field)}
          {pad(p.more)}
        </MoreRows>
        {inh && pad(inh.actions)}
      </>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2.5 pl-4 pr-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1c1c21] text-[oklch(0.78_0.12_255)] [&>svg]:h-[19px] [&>svg]:w-[19px]">
          {identity.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold leading-4 text-ui-1">{identity.name}</div>
          <div className="truncate text-[11px] text-[#8a8a94]">{identity.meta(changed)}</div>
        </div>
        {identity.onToggleVisible && (
          <button
            type="button"
            onClick={identity.onToggleVisible}
            title={identity.hidden ? "Show" : "Hide"}
            aria-label={identity.hidden ? "Show" : "Hide"}
            className={BUTTON}
          >
            {identity.hidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        )}
        <AllSettings onClick={toFull} />
      </div>
      <div role="toolbar" aria-label="Setting groups" className="flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-2 pt-1.5 [scrollbar-width:none]">
        <Tile icon={<Zap />} label="Quick" active={!active} dot={false} onClick={() => pick("quick")} />
        {sections.map((s) => {
          const Icon = sectionIcon(s);
          return (
            <Tile
              key={s.id}
              icon={<Icon />}
              label={sectionShort(s)}
              active={active?.id === s.id}
              dot={changedOf(s) > 0}
              onClick={() => pick(s.id)}
            />
          );
        })}
      </div>
      {sheet.snap !== "peek" && (
        <div {...{ [INSPECTOR_SCROLL]: "" }} className="min-h-0 flex-1 overflow-y-auto border-t border-ui-subtle pb-3 pt-1">
          {body()}
        </div>
      )}
    </div>
  );
}
