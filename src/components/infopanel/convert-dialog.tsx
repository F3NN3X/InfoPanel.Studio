/**
 * Convert to InfoPanel: a native zone, or every zone on the page, rebuilt as InfoPanel items. The first step is
 * the choice per widget (remembered on its zone); the second is the report of what each one became. A zone lands as
 * an InfoPanel canvas zone beside it; a screen becomes a new profile holding one canvas zone.
 */
import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { modules } from "@/modules";
import { useSensorCatalog } from "@/lib/catalog";
import { ITEM_ID, type Placement, type ProfilePage, type ProfileView } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { choiceFor, ON_INFOPANEL_KEY, rowsOf, startChoices, writeChoices, type Choices } from "@/lib/infopanel/export/native-choices";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import type { Converted, ReportRow } from "@/lib/infopanel/native/convert-view";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import type { NativeChoice } from "@/lib/infopanel/native/tiers";
import { CHOICE_LABEL, NativeExportStep } from "./native-export-step";

export type ConvertScope = "zone" | "screen";

export interface ConvertedCanvas {
  scope: ConvertScope;
  canvas: StoredCanvas;
  name: string;
  size: { width: number; height: number };
}

export interface ConvertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: ConvertScope;
  profile: ProfileView;
  /** The zone "Convert zone" is about. */
  zoneId?: string;
  /** The page as stored: a screen's conversion takes its InfoPanel items too, as the items they are (SPEC §11.4). */
  page?: ProfilePage;
  /** The choices to remember on their zones (one undo-free settings write per zone). */
  onRemember: (zoneId: string, settings: NonNullable<Placement["settings"]>) => void;
  /** The canvas it made, to place; a string back is why it couldn't be placed. */
  onConverted: (c: ConvertedCanvas) => string | null;
  onDone: (message: string) => void;
}

const LOOK = { Font: "Segoe UI", FontSize: 20, Color: "#FFFFFFFF", BackgroundColor: "#FF0A0A0C" };
const titleOf = (id: string) => modules.find((m) => m.id === id)?.title ?? id;

function Report({ rows }: { rows: readonly ReportRow[] }) {
  return (
    <div className="flex flex-col rounded-[10px] border border-ui-default" aria-label="Conversion report">
      {rows.length === 0 && <span className="px-3.5 py-2.5 text-[12px] text-ui-4">Nothing was converted.</span>}
      {rows.map((r, i) => (
        <div key={`${r.name}:${i}`} className="flex flex-col gap-0.5 border-b border-ui-subtle px-3.5 py-2.5 last:border-b-0">
          <div className="flex items-baseline gap-3 text-[12.5px]">
            <span className="w-[150px] truncate font-medium text-ui-1">{r.name}</span>
            <span className={cn("w-[110px] text-[11.5px]", r.choice === "not-compatible" ? "text-ui-warning" : "text-ui-3")}>{r.choice === "not-compatible" ? "Not compatible" : CHOICE_LABEL[r.choice]}</span>
            <span className="flex-1 text-[12px] text-ui-3">{r.outcome}</span>
          </div>
          {r.notes.map((n) => (
            <span key={n} className="ml-[162px] text-[11.5px] text-ui-4">
              {n}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function ConvertBody({ scope, profile, zoneId, page, onRemember, onConverted, onDone, onClose }: Omit<ConvertDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const sensors = useSensorCatalog().sensors as unknown as Record<string, DataApiValue>;
  const zones = profile.placements.filter((p) => (scope === "zone" ? p.id === zoneId : p.visible));
  const rows = zones.flatMap((p) => rowsOf(p, titleOf));
  /** The page whose InfoPanel items a screen's conversion keeps (there is nothing to choose for them). */
  const itemPage = scope === "screen" && page?.placements.some((p) => p.module === ITEM_ID) ? page : undefined;
  const [choices, setChoices] = useState<Record<string, Choices>>(() => Object.fromEntries(zones.map((p) => [p.id, startChoices(p.settings)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<readonly ReportRow[] | null>(null);

  const choose = (zone: string, key: string, choice: NativeChoice) => setChoices((c) => ({ ...c, [zone]: { ...c[zone], [key]: choice } }));
  const setAll = (choice: NativeChoice) =>
    setChoices(Object.fromEntries(zones.map((p) => [p.id, Object.fromEntries(rows.filter((r) => r.zoneId === p.id && r.options.includes(choice)).map((r) => [r.key, choice]))])));

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      // Remember the choices on their zones, then read the zones from the page with them.
      const withChoices: Placement[] = zones.map((p) => {
        const own = rows.filter((r) => r.zoneId === p.id);
        const picked = Object.fromEntries(own.map((r) => [r.key, choiceFor(r, choices[p.id] ?? {})]));
        const written = writeChoices(p.settings, picked, own.map((r) => r.key));
        // A module zone's pick is its On InfoPanel rule too, so the inspector and the next conversion agree.
        const settings = picked.zone ? { ...written, [ON_INFOPANEL_KEY]: picked.zone } : written;
        onRemember(p.id, settings);
        return { ...p, settings };
      });
      const [{ convertView }, { canvasFromItems }] = await Promise.all([import("@/lib/infopanel/native/convert-view"), import("@/lib/infopanel/native/to-canvas")]);
      const result: Converted = await convertView({ placements: withChoices, scope: document, sensors, look: LOOK, titleOf, ...(scope === "zone" ? { only: zoneId } : {}), ...(itemPage ? { page: { screen: profile, page: itemPage } } : {}) });
      setReport(result.report);
      if (result.items.length === 0) return;
      const box = scope === "zone" ? zones[0] : undefined;
      const name = scope === "screen" ? `${profile.name} (InfoPanel)` : `${box ? titleOf(box.module) : "Zone"} (InfoPanel)`;
      const size = result.size;
      const canvas = await canvasFromItems(result.items, result.assets, { name, ...size });
      const why = onConverted({ scope, canvas, name, size });
      if (why) setError(why);
      else onDone(`Converted ${scope === "screen" ? "the screen" : "the zone"} to InfoPanel · ${result.report.length} widgets`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center border-b border-ui-subtle px-5 py-4">
        <Dialog.Title className="flex-1 text-[15px] font-semibold text-ui-1">{scope === "screen" ? "Convert screen to InfoPanel profile (experimental)" : "Convert zone to InfoPanel (experimental)"}</Dialog.Title>
        <Dialog.Close title="Close" className="grid h-7 w-7 place-items-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1">
          <X className="h-5 w-5" />
        </Dialog.Close>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-5 py-[18px]">
        {report ? <Report rows={report} /> : <NativeExportStep rows={rows} choices={choices} onChoose={choose} onSetAll={setAll} />}
        {error && <p className="text-[12px] text-ui-danger">{error}</p>}
      </div>
      <div className="flex items-center gap-2.5 border-t border-ui-subtle px-5 py-3">
        <span className="text-[11.5px] text-ui-4">{report ? "The converted canvas is on the screen: export it from Export & back up." : "Your choices are remembered for this screen."}</span>
        <span className="flex-1" />
        <button type="button" onClick={onClose} className="h-8 px-3 text-[12.5px] text-ui-3 hover:text-ui-1">
          {report ? "Close" : "Cancel"}
        </button>
        {!report && (
          <button type="button" disabled={busy || (rows.length === 0 && !itemPage)} onClick={() => void run()} className="h-8 rounded-[7px] bg-ui-inverse px-4 text-[12.5px] font-semibold text-ui-inverse-fg disabled:opacity-60">
            {busy ? "Converting…" : "Convert"}
          </button>
        )}
      </div>
    </>
  );
}

export function ConvertDialog({ open, onOpenChange, ...rest }: ConvertDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-48px)] w-[min(720px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[14px] border border-ui-strong bg-ui-panel font-ui text-ui-1 shadow-ui-modal outline-none">
          {open && <ConvertBody {...rest} onClose={() => onOpenChange(false)} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
