/**
 * Library › Profile assets (spec §3): the active profile's canvas files, the lab's assets table.
 * Each action is one edit of the zone's file table, written back as one `setConfig` (one undo step).
 */
import { useMemo, useState, type ReactNode } from "react";
import { Ban, Copy, Grid2x2, HardDrive, ImageOff, Minimize2, Plus, Replace, Sparkles, type LucideIcon } from "lucide-react";
import type { HistorySetter } from "@/hooks/use-config-history";
import type { Placement } from "@/lib/layout";
import { formatBytes } from "@/lib/assets";
import { add, MIME, remove, removeWithUses, replace, scanRefs, usesOf, type AssetFile } from "@/lib/infopanel/assets/assets";
import { cleanBasics, cleanupCount, findingsOf, type Finding } from "@/lib/infopanel/assets/stored-doc";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import { cn } from "@/lib/utils";
import { BUTTON, PRIMARY } from "./profile-assets/drawer";
import { readFiles, reencodable, reencode } from "./profile-assets/encode";
import { FilePick } from "./profile-assets/file-pick";
import { FilesTable, FINDING_LABEL, isTiled } from "./profile-assets/files-table";
import { OptimiseDrawer } from "./profile-assets/optimise-drawer";
import { ReplaceDrawer } from "./profile-assets/replace-drawer";
import { useProfileDoc } from "./profile-assets/use-profile-doc";

export interface ProfileAssetsProps {
  /** The canvas zones on the page on the canvas, each with its stored form. */
  zones: (Placement & { canvas: StoredCanvas })[];
  /** Every change is one `setConfig` on the zone's stored form (`withCanvas`): one undo step. */
  setConfig: HistorySetter;
  /** Select items on the canvas: opens the canvas editor on that zone with those paths selected. */
  onSelectUses: (zoneId: string, paths: string[]) => void;
  /** "Save a copy to My library": the file goes through the library's upload. */
  onSaveToLibrary: (files: File[]) => void;
  /** The page background's image when it is tiled (`fit: "tile"`): the file served from it shows "Tiled". */
  tiledSrc?: string;
  /** "Use for selection": apply the file's stored image to what is selected in the studio. */
  onUse: (file: AssetFile) => void;
  /** Why nothing selected takes an image, or undefined when something does. */
  useBlocked?: string;
}

const CHIPS: [Finding, LucideIcon][] = [
  ["unused", Ban],
  ["identical", Copy],
  ["larger", Minimize2],
  ["large", HardDrive],
  ["missing", ImageOff],
];

/** The stored file as a `File` for the library's upload. */
const fileOf = (f: AssetFile) => new File([f.bytes.slice()], f.name, { type: MIME[f.type] });

export function ProfileAssets({ zones, setConfig, onSelectUses, onSaveToLibrary, tiledSrc, onUse, useBlocked }: ProfileAssetsProps) {
  const [zoneId, setZoneId] = useState<string | null>(null);
  const zone = zones.find((z) => z.id === zoneId) ?? zones[0];
  if (!zone) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-[12.5px] text-ui-4">
        This page has no canvas zone. Import an InfoPanel profile to see its files.
      </div>
    );
  }
  const picker =
    zones.length > 1 ? (
      <select
        aria-label="Canvas zone"
        value={zone.id}
        onChange={(e) => setZoneId(e.target.value)}
        className="h-[30px] max-w-[180px] rounded-[7px] border border-ui-default bg-ui-app px-2 text-[12.5px] text-ui-1"
      >
        {zones.map((z, i) => (
          <option key={z.id} value={z.id}>
            {z.canvas.source.name || `Canvas ${i + 1}`}
          </option>
        ))}
      </select>
    ) : null;
  return (
    <ZoneAssets
      key={zone.id}
      zoneId={zone.id}
      stored={zone.canvas}
      picker={picker}
      setConfig={setConfig}
      onSelectUses={(paths) => onSelectUses(zone.id, paths)}
      onSaveToLibrary={onSaveToLibrary}
      tiledSrc={tiledSrc}
      onUse={onUse}
      useBlocked={useBlocked}
    />
  );
}

interface ZoneProps {
  zoneId: string;
  stored: StoredCanvas;
  picker: ReactNode;
  setConfig: HistorySetter;
  onSelectUses: (paths: string[]) => void;
  onSaveToLibrary: (files: File[]) => void;
  tiledSrc?: string;
  onUse: (file: AssetFile) => void;
  useBlocked?: string;
}

function ZoneAssets({ zoneId, stored, picker, setConfig, onSelectUses, onSaveToLibrary, tiledSrc, onUse, useBlocked }: ZoneProps) {
  const { doc, busy, note, commit } = useProfileDoc(zoneId, stored, setConfig);
  const [filter, setFilter] = useState<Finding | null>(null);
  const [tiledOnly, setTiledOnly] = useState(false);
  const [drawer, setDrawer] = useState<"optimise" | null>(null);
  const [picked, setPicked] = useState<AssetFile[] | null>(null);
  const found = useMemo(() => (doc ? findingsOf(doc) : null), [doc]);
  const uses = useMemo(() => (doc ? usesOf(doc.items) : new Map()), [doc]);
  const shrinkable = useMemo(() => (doc && found ? found.larger.filter((o) => reencodable(doc.assets.get(o.name.toLowerCase())!)) : []), [doc, found]);

  if (!doc || !found) return <div className="flex-1 p-6 text-[12.5px] text-ui-4">Reading the files…</div>;

  const total = [...doc.assets.values()].reduce((n, f) => n + f.bytes.length, 0);
  const external = new Set(scanRefs(doc.items).others.map((o) => `${o.kind}:${o.value}`)).size;
  const tiled = [...doc.assets.values()].filter((f) => isTiled(f, tiledSrc)).length;
  const cleanable = cleanupCount(found, shrinkable.map((o) => o.name));

  const addFiles = (list: File[]) =>
    commit("Adding", async (d) => {
      const files = await readFiles(list);
      const known = new Map([...d.assets.values()].map((f) => [f.hash, f.name]));
      const reused = files.flatMap((f) => (known.has(f.hash) ? [`${f.name} (as ${known.get(f.hash)})`] : []));
      return { doc: add(d, files).doc, message: reused.length ? `Already in this screen, not added again: ${reused.join(", ")}` : undefined };
    });

  const replaceOne = (name: string, list: File[]) =>
    commit("Replacing", async (d) => {
      const [file] = await readFiles(list);
      return { doc: replace(d, name, file) };
    });

  const cleanUp = () =>
    commit("Cleaning up", async (d) => {
      let next = cleanBasics(d);
      const skipped: string[] = [];
      for (const o of findingsOf(next).larger) {
        const f = next.assets.get(o.name.toLowerCase());
        const out = f && reencodable(f) ? await reencode(f, o.target!, "same", 92) : null;
        if (f && out && out.bytes.length < f.bytes.length) next = replace(next, o.name, out);
        else skipped.push(o.name);
      }
      return { doc: next, message: skipped.length ? `Not smaller when re-encoded, kept: ${skipped.join(", ")}` : undefined };
    });

  return (
    <div className="relative flex min-w-0 flex-1 font-ui">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="flex flex-wrap items-center gap-3 px-6 py-3">
          {picker}
          <span className="font-ui-mono text-[11.5px] text-ui-4">
            {doc.assets.size} files · {formatBytes(total)} · {external} external
          </span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Findings">
            {CHIPS.map(([id, Icon]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                disabled={found.counts[id] === 0 && filter !== id}
                onClick={() => setFilter(filter === id ? null : id)}
                className={cn(
                  "flex h-[28px] items-center gap-1.5 rounded-full border border-ui-default px-2.5 text-[12px] text-ui-2 hover:bg-ui-hover disabled:pointer-events-none disabled:opacity-40",
                  id === "missing" && found.counts[id] > 0 && "border-ui-danger/50 text-ui-danger",
                  filter === id && "border-ui-accent bg-ui-accent/10 text-ui-1",
                )}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {FINDING_LABEL[id]}
                <span className="font-ui-mono text-[11px] text-ui-warning">{found.counts[id]}</span>
              </button>
            ))}
            {tiledSrc && (
              <button
                type="button"
                aria-pressed={tiledOnly}
                disabled={tiled === 0 && !tiledOnly}
                title="Files used as the page background's tile"
                onClick={() => setTiledOnly(!tiledOnly)}
                className={cn(
                  "flex h-[28px] items-center gap-1.5 rounded-full border border-ui-default px-2.5 text-[12px] text-ui-2 hover:bg-ui-hover disabled:pointer-events-none disabled:opacity-40",
                  tiledOnly && "border-ui-accent bg-ui-accent/10 text-ui-1",
                )}
              >
                <Grid2x2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                Tiled
                <span className="font-ui-mono text-[11px] text-ui-warning">{tiled}</span>
              </button>
            )}
          </div>
          <span className="flex-1" />
          <FilePick multiple disabled={busy !== null} className={BUTTON} onFiles={addFiles}>
            <Plus className="h-4 w-4" /> Add files
          </FilePick>
          <FilePick multiple disabled={busy !== null} className={BUTTON} onFiles={(list) => void readFiles(list).then(setPicked)}>
            <Replace className="h-4 w-4" /> Replace by name…
          </FilePick>
          <button type="button" disabled={busy !== null} onClick={() => setDrawer("optimise")} className={BUTTON}>
            <Sparkles className="h-4 w-4" /> Optimise images…
          </button>
          <button type="button" disabled={busy !== null || cleanable === 0} onClick={() => void cleanUp()} className={PRIMARY} title="Removes unused files, merges identical ones and downscales to the drawn size">
            Clean up {cleanable}
          </button>
      </div>
      {note && (
        <div role="status" className="px-6 pb-2 text-[12px] text-ui-3">
          {note}
        </div>
      )}
      <FilesTable
        doc={doc}
        found={found}
        uses={uses}
        filter={filter}
        tiledOnly={tiledOnly}
        tiledSrc={tiledSrc}
        useBlocked={useBlocked}
        onUse={onUse}
        disabled={busy !== null}
        onSelectUses={onSelectUses}
        onSave={(f) => onSaveToLibrary([fileOf(f)])}
        onReplace={(name, list) => void replaceOne(name, list)}
        onRemove={(name) => void commit("Removing", (d) => ({ doc: (uses.get(name.toLowerCase())?.length ? removeWithUses : remove)(d, [name]) }))}
      />
      </div>
      {drawer === "optimise" && <OptimiseDrawer doc={doc} onClose={() => setDrawer(null)} onApply={(edit) => void commit("Optimising", () => edit)} />}
      {picked && <ReplaceDrawer doc={doc} files={picked} onClose={() => setPicked(null)} onApply={(edit) => void commit("Replacing", () => edit)} />}
    </div>
  );
}
