/**
 * The review list for loose uploads: each file with a thumbnail, its size and a "Used by a profile"
 * tag, to add to My library or delete. A used file is never deleted from here.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { deleteAsset, formatBytes, unusedAssets, type Asset } from "@/lib/assets";

const BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-ui-strong bg-ui-raised px-3 text-[12.5px] font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1 disabled:pointer-events-none disabled:opacity-40";
const LINK = "text-[12px] text-ui-3 hover:text-ui-1";

/** The name an imported upload gets: "Upload 1a2b3c4d.png" reads better than the 64-hex id. */
const nameOf = (a: Asset) => `Upload ${a.id.slice(0, 8)}${a.id.includes(".") ? a.id.slice(a.id.lastIndexOf(".")) : ""}`;

interface LooseReviewDialogProps {
  open: boolean;
  /** The loose files (what `looseAssets` found). */
  loose: readonly Asset[];
  /** The studio's config as JSON: a file it names is in use even when the saved config does not (yet). */
  config: string;
  onClose: () => void;
  onImport: (assets: readonly Asset[]) => Promise<{ added: number; duplicates: number; failed: number }>;
  /** Something was added or deleted: the list and the banner refresh. */
  onChanged: () => void;
  onResult: (message: string) => void;
}

export function LooseReviewDialog({ open, loose, config, onClose, onImport, onChanged, onResult }: LooseReviewDialogProps) {
  /** The ids no profile refers to (the server's `?unused=1`); null until known. */
  const [unused, setUnused] = useState<ReadonlySet<string> | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setUnused(null);
    setPicked(new Set());
    setConfirming(false);
    setCheckFailed(false);
    unusedAssets().then(
      (list) => live && setUnused(new Set(list.map((a) => a.id))),
      () => live && setCheckFailed(true),
    );
    return () => {
      live = false;
    };
  }, [open]);

  // After an add or a delete the list shrinks: the selection keeps only what is still loose.
  useEffect(() => {
    setPicked((p) => {
      const kept = new Set(loose.filter((a) => p.has(a.id)).map((a) => a.id));
      return kept.size === p.size ? p : kept;
    });
  }, [loose]);

  const isUsed = (a: Asset) => !unused || !unused.has(a.id) || config.includes(a.id.slice(0, 64));
  const used = useMemo(() => new Set(loose.filter(isUsed).map((a) => a.id)), [loose, unused, config]);
  const chosen = loose.filter((a) => picked.has(a.id));
  const anyUsed = chosen.some((a) => used.has(a.id));

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const add = async () => {
    setBusy(true);
    const r = await onImport(chosen);
    setBusy(false);
    onResult(`Added ${r.added} uploaded file${r.added === 1 ? "" : "s"} to My library${r.failed ? `, ${r.failed} failed` : ""}`);
    onChanged();
  };
  const del = async () => {
    setConfirming(false);
    if (anyUsed) return;
    setBusy(true);
    // Asked again: a profile may have taken a file since the list was read.
    let fresh: ReadonlySet<string>;
    try {
      fresh = new Set((await unusedAssets()).map((a) => a.id));
    } catch {
      setBusy(false);
      return onResult("Nothing deleted: could not check which files are in use");
    }
    setUnused(fresh);
    const drop = chosen.filter((a) => fresh.has(a.id) && !config.includes(a.id.slice(0, 64)));
    const results = await Promise.allSettled(drop.map((a) => deleteAsset(a.id)));
    setBusy(false);
    const failed = results.filter((r) => r.status === "rejected").length;
    const skipped = chosen.length - drop.length;
    const gone = drop.length - failed;
    onResult(`Deleted ${gone} uploaded file${gone === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}${skipped ? `, ${skipped} skipped because a profile uses ${skipped === 1 ? "it" : "them"}` : ""}`);
    onChanged();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-[36rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl border border-ui-strong bg-ui-raised p-4 font-ui text-ui-1 shadow-ui-modal outline-none">
          <Dialog.Title className="text-sm font-semibold text-ui-1">Uploaded files not in My library</Dialog.Title>
          <Dialog.Description className="text-xs leading-relaxed text-ui-3">
            Older uploads that no item holds. Add the ones you want to keep; delete the rest. A file a profile still uses can only be added.
          </Dialog.Description>
          <div className="flex items-center gap-3">
            <button type="button" className={LINK} onClick={() => setPicked(new Set(loose.map((a) => a.id)))}>
              Select all
            </button>
            <button type="button" className={LINK} onClick={() => setPicked(new Set(loose.filter((a) => !used.has(a.id)).map((a) => a.id)))}>
              Select unused
            </button>
            <span className="flex-1" />
            <span className="font-ui-mono text-[11px] text-ui-4">
              {chosen.length} of {loose.length} selected
            </span>
          </div>
          <ul aria-label="Loose uploads" className="min-h-0 flex-1 divide-y divide-ui-subtle overflow-y-auto rounded-[8px] border border-ui-subtle">
            {loose.map((a) => (
              <li key={a.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-ui-hover">
                  <input type="checkbox" checked={picked.has(a.id)} onChange={() => toggle(a.id)} aria-label={nameOf(a)} />
                  <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[6px] bg-[#0b0b0e]">
                    {a.kind === "video" ? (
                      <video src={a.url} preload="metadata" muted className="h-full w-full object-cover" />
                    ) : (
                      <img src={a.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-ui-1">{nameOf(a)}</span>
                    <span className="block font-ui-mono text-[10.5px] text-ui-4">{formatBytes(a.size)}</span>
                  </span>
                  {unused && used.has(a.id) && <span className="rounded-[4px] bg-[#2a1d0a] px-1.5 py-px text-[10.5px] font-medium text-ui-warning">Used by a profile</span>}
                </label>
              </li>
            ))}
          </ul>
          {confirming ? (
            <div className="flex items-center justify-end gap-2 pt-1">
              <span className="flex-1 text-xs text-ui-2">
                Delete {chosen.length} file{chosen.length === 1 ? "" : "s"}? This can’t be undone.
              </span>
              <button type="button" className={BUTTON} onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" className="inline-flex h-8 items-center rounded-[7px] bg-ui-danger px-3 text-[12.5px] font-semibold text-ui-inverse-fg transition-opacity hover:opacity-90" onClick={() => void del()}>
                Delete
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2 pt-1">
              <Dialog.Close render={<button type="button" className={BUTTON} />}>Close</Dialog.Close>
              <button
                type="button"
                className={BUTTON}
                disabled={busy || chosen.length === 0 || anyUsed || !unused}
                title={checkFailed ? "Couldn't check which files are in use" : !unused ? "Checking which files a profile uses…" : anyUsed ? "A profile still uses a selected file: only unused files can be deleted" : undefined}
                onClick={() => setConfirming(true)}
              >
                Delete…
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-[8px] bg-ui-inverse px-3 text-[12.5px] font-medium text-ui-inverse-fg hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
                disabled={busy || chosen.length === 0}
                onClick={() => void add()}
              >
                {busy ? "Working…" : "Add to My library"}
              </button>
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
