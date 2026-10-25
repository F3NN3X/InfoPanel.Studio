/**
 * Your own icons in the inspector: an Icon element's file, and a Drives element's icon per drive.
 * A file comes from My library (or a new upload, which goes there too) and joins the canvas's files;
 * a lucide icon is picked from the icon set. A file is drawn as it is, never tinted.
 */
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { driveIconOf, iconFileOf, normalizeDriveIcons, type IconSource } from "@/lib/effects/icon";
import type { DrivesSpec } from "@/lib/infopanel/elements/spec";
import type { DisplayItem } from "@/lib/infopanel/schema";
import type { DroppedFile } from "@/lib/infopanel/canvas-edit";
import { ImagePicker } from "./image-picker";

const BUTTON = "flex h-7 items-center justify-center rounded-[7px] border border-ui-default bg-ui-raised px-2.5 text-[12px] text-ui-1 hover:border-ui-strong";

/** A source in words: the file's name, the lucide name, or the default. */
const labelOf = (source: IconSource | null): string => (source ? iconFileOf(source) ?? ("lucide" in source ? source.lucide : "") : "Default");

interface IconFileButtonsProps {
  label: string;
  title: string;
  /** Whether a file or a lucide icon is set now, so Reset shows. */
  source: IconSource | null;
  onFile: (file: DroppedFile) => void;
  onReset: () => void;
  /** Opens the lucide list, when this row has one. */
  onLucide?: () => void;
}

/** Choose a file from My library, pick a lucide icon, or go back to the default. */
export function IconFileButtons({ label, title, source, onFile, onReset, onLucide }: IconFileButtonsProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" aria-label={`${label}: choose a file`} onClick={() => setOpen(true)} className={BUTTON}>
        Your image…
      </button>
      {onLucide && (
        <button type="button" aria-label={`${label}: pick an icon from the set`} onClick={onLucide} className={BUTTON}>
          Icon set
        </button>
      )}
      {source && (
        <button type="button" aria-label={`${label}: back to the default`} onClick={onReset} className={cn(BUTTON, "text-ui-3")}>
          Reset
        </button>
      )}
      <ImagePicker open={open} onOpenChange={setOpen} title={title} onPick={onFile} />
    </div>
  );
}

interface DriveIconsProps {
  item: DisplayItem;
  spec: DrivesSpec;
  /** The spec with `icons` replaced (checked by its normalizer). */
  onIcons: (icons: Record<string, IconSource> | undefined) => void;
  /** A file picked for a drive: it joins the canvas's files and the spec follows. */
  onFile: (key: string, file: DroppedFile) => void;
  /** The icon-set list for one drive, shown under its row. */
  lucide: (key: string, close: () => void) => ReactNode;
}

/** One row per drive tile: its name, the icon it has, and the way to change it. */
export function DriveIcons({ item, spec, onIcons, onFile, lucide }: DriveIconsProps) {
  const [listFor, setListFor] = useState<string | null>(null);
  if (item.kind !== "Group") return null;
  const tiles = item.DisplayItems.flatMap((t) => (t.kind === "Group" ? [{ key: (t as DisplayItem & { driveId?: string }).driveId ?? t.Name, id: (t as DisplayItem & { driveId?: string }).driveId, name: t.Name }] : []));
  // Reset drops the icon wherever it is kept, under the drive's id or its name.
  const reset = (t: { key: string; name: string }) => {
    const { [t.key]: _id, [t.name]: _name, ...rest } = spec.icons ?? {};
    onIcons(normalizeDriveIcons(rest));
  };
  return (
    <div className="space-y-1.5" aria-label="Icon per drive">
      <p className="text-[11.5px] leading-snug text-ui-4">An icon per drive: an image from My library, or one from the icon set. A drive keeps it when the drives are found again.</p>
      {tiles.map((t) => {
        const own = driveIconOf(spec.icons, t.id, t.name);
        return (
          <div key={t.key} className="space-y-1 rounded-[7px] border border-ui-subtle p-1.5">
            <div className="flex items-center justify-between gap-2 text-[12px] text-ui-2">
              <span className="min-w-0 truncate" title={t.name}>
                {t.name}
              </span>
              <span className="shrink-0 text-ui-4">{labelOf(own)}</span>
            </div>
            <IconFileButtons
              label={t.name}
              title={`Icon for ${t.name}`}
              source={own}
              onFile={(file) => onFile(t.key, file)}
              onReset={() => {
                setListFor(null);
                reset(t);
              }}
              onLucide={() => setListFor(listFor === t.key ? null : t.key)}
            />
            {listFor === t.key && lucide(t.key, () => setListFor(null))}
          </div>
        );
      })}
    </div>
  );
}
