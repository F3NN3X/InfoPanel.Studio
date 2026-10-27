/**
 * The Export check on a grid page (one-editor SPEC §7.4, §8), loaded only for a screen made for InfoPanel so the
 * export model stays out of the studio's first bundle: the header pill, the live panel with the way into the
 * conversion, and a grid widget's On InfoPanel choice (stored on its zone as `settings.$onInfoPanel`, which the
 * Convert dialog starts from).
 */
import { useEffect, useMemo } from "react";
import { PANEL_ID, type Placement, type ProfileView } from "@/lib/layout";
import { exportCheck, widgetChoice, widgetRow } from "@/lib/infopanel/export-check";
import { tierOf, type NativeChoice } from "@/lib/infopanel/native/tiers";
import { widgetChoices } from "@/lib/infopanel/native/widget-item";
import { ON_INFOPANEL_KEY } from "@/lib/infopanel/export/native-choices";
import { choiceHelp, OnInfoPanelSection } from "@/components/studio/inspector/on-infopanel-section";
import { CheckBadge, ExportCheckPanel, ExportCheckPill } from "./export-check-panel";

type NameOf = (zone: Placement) => string;

const useCheck = (profile: ProfileView, nameOf: NameOf) => useMemo(() => exportCheck(profile, profile, nameOf), [profile, nameOf]);

/** A grid zone's badge on the canvas: its status as a Studio widget. */
export function GridBadge({ zone, name }: { zone: Placement; name: string }) {
  return <CheckBadge status={widgetRow(zone, name).status} />;
}

export function GridCheckPill({ profile, nameOf, open, onClick }: { profile: ProfileView; nameOf: NameOf; open: boolean; onClick: () => void }) {
  return <ExportCheckPill check={useCheck(profile, nameOf)} open={open} onClick={onClick} />;
}

interface GridCheckPanelProps {
  profile: ProfileView;
  nameOf: NameOf;
  /** A row: its zone (a free area's item selects the area). */
  onSelect: (zoneId: string) => void;
  /** Review conversion… and Export: a grid page goes to InfoPanel through the Convert dialog. */
  onConvert: () => void;
  onClose: () => void;
}

export function GridCheckPanel({ profile, nameOf, onSelect, onConvert, onClose }: GridCheckPanelProps) {
  const check = useCheck(profile, nameOf);
  // Esc closes it, as selecting anything does: in the capture phase, before the studio's shortcuts take the key, and
  // not while a dialog or menu is open over it (Esc is theirs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <ExportCheckPanel
      check={check}
      onSelect={(path) => onSelect(path.split(":")[0])}
      onExport={onConvert}
      notice={
        <p className="rounded-[6px] bg-ui-hover px-2.5 py-1.5 text-[11.5px] leading-snug text-ui-2">
          This page will be converted when you export.{" "}
          <button type="button" onClick={onConvert} className="text-ui-accent-text hover:underline">
            Review conversion…
          </button>
        </p>
      }
    />
  );
}

/** A grid widget's On InfoPanel section (SPEC §5.5): its status and, for a module, Recreate / Snapshot / Leave out. */
export function GridOnInfoPanel({ zone, name, onSettings }: { zone: Placement; name: string; onSettings: (settings: NonNullable<Placement["settings"]>) => void }) {
  const row = widgetRow(zone, name);
  if (zone.module === PANEL_ID || zone.panel) {
    return <OnInfoPanelSection row={row}>Each widget of the panel is rebuilt as InfoPanel items; the Convert dialog picks per widget.</OnInfoPanelSection>;
  }
  const stored = zone.settings?.[ON_INFOPANEL_KEY];
  const value = widgetChoice(zone.module, typeof stored === "string" ? (stored as NativeChoice) : undefined);
  const entry = tierOf(zone.module);
  return (
    <OnInfoPanelSection row={row} choice={{ options: widgetChoices(zone.module), value, onChange: (c) => onSettings({ ...zone.settings, [ON_INFOPANEL_KEY]: c }) }}>
      {choiceHelp(value, name, entry)}
    </OnInfoPanelSection>
  );
}
