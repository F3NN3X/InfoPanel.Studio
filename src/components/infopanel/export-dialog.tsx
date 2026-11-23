/**
 * Export: a canvas zone written as its stored form (`.canvas.zip`). A font that may not be shared stays out unless it
 * is included, or is swapped for one that may travel (`FontLicenceReview`).
 */
import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { TriangleAlert, X } from "lucide-react";
import { isTauri, saveBinaryFile } from "@/lib/desktop";
import { formatBytes } from "@/lib/assets";
import type { Placement } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { readStoreFile } from "@/lib/infopanel/canvas";
import { canvasZip, defaultFontChoice, fileStem, fontLicences, withFontChoices, withSwapFiles, type FontChoice } from "@/lib/infopanel/export/studio-export";
import { openStored, type OpenedSource } from "@/lib/infopanel/import/session";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import { FontLicenceReview } from "./font-licence-review";
import { useSwapTargets } from "./use-swap-targets";

export interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The canvas zone to export (the selected one, else the profile's first). */
  zone: Placement | undefined;
  /** A finished export, for a toast. */
  onDone: (message: string) => void;
}

/** Desktop: the native Save As (a cancel does nothing; an error falls back to the browser). Else a download. */
export async function download(name: string, data: Uint8Array, type: string): Promise<void> {
  if (isTauri()) {
    try {
      await saveBinaryFile(name, "zip", data);
      return;
    } catch (e) {
      console.error("Native save failed, downloading instead", e);
    }
  }
  const url = URL.createObjectURL(new Blob([data.slice()], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function ExportBody({ canvas, onClose, onDone }: { canvas: StoredCanvas; onClose: () => void } & Pick<ExportDialogProps, "onDone">) {
  const [opened, setOpened] = useState<OpenedSource | Error | null>(null);
  const licences = fontLicences(canvas, opened instanceof Error ? undefined : opened?.restore?.fontFiles);
  const [choices, setChoices] = useState<Map<string, FontChoice>>(() => new Map(licences.map((r) => [r.hash, defaultFontChoice(r)])));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const targets = useSwapTargets(licences.some((r) => r.verdict === "keep"));

  useEffect(() => {
    let stop = false;
    openStored(canvas, (h, e, t) => readStoreFile(h, e, t)).then(
      (o) => !stop && setOpened(o),
      (e: unknown) => !stop && setOpened(e instanceof Error ? e : new Error(String(e))),
    );
    return () => {
      stop = true;
    };
  }, [canvas]);

  const name = canvas.source.name || "profile";
  const fileName = `${fileStem(name)}.canvas.zip`;
  if (!opened) return <p className="p-5 text-body text-ui-3">Reading the canvas’s files…</p>;
  if (opened instanceof Error) return <p role="alert" className="p-5 text-body text-ui-danger">{opened.message}</p>;

  const fontFiles = opened.restore?.fontFiles ?? new Map<string, Uint8Array>();
  const keptFonts = licences.filter((r) => choices.get(r.hash) !== "leave");
  const included = keptFonts.filter((r) => r.verdict === "keep" && typeof choices.get(r.hash) !== "object");
  const assetBytes = [...opened.assets.values()].reduce((n, f) => n + f.bytes.length, 0);
  const fontBytes = keptFonts.reduce((n, r) => {
    const c = choices.get(r.hash);
    return n + (typeof c === "object" ? c.swap.bytes.length : (fontFiles.get(r.hash)?.length ?? 0));
  }, 0);
  const missing = opened.restore?.missing ?? [];
  const contents: [string, string][] = [
    ["canvas.json", "infopanel-canvas v1"],
    ["assets/", `${opened.assets.size} files · by SHA-256`],
    ["fonts/", `${keptFonts.length} files`],
  ];

  const run = async () => {
    setError(null);
    setBusy("Writing…");
    try {
      const stored = withFontChoices(canvas, choices);
      await download(fileName, canvasZip(stored, opened.assets, withSwapFiles(fontFiles, choices)), "application/zip");
      onDone(`Exported ${fileName}${included.length ? ` · it holds ${included.map((r) => r.family).join(", ")}, not cleared for sharing` : ""}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="flex items-center border-b border-ui-subtle px-5 py-4">
        <Dialog.Title className="flex-1 text-title font-medium text-ui-1">Export {name}</Dialog.Title>
        <Dialog.Close title="Close" aria-label="Close" className="grid h-8 w-8 place-items-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1">
          <X className="h-5 w-5" />
        </Dialog.Close>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4.5 overflow-auto px-5 py-4.5">
        <p className="text-caption text-ui-4">Reopens here exactly as it is: mode, remap choices, fonts and assets, each checked by SHA-256.</p>
        {missing.length > 0 && (
          <p className="flex gap-1.5 text-caption text-ui-warn">
            <TriangleAlert className="h-4 w-4 shrink-0" /> Not in the asset store, so not exported: {missing.join(", ")}
          </p>
        )}
        <FontLicenceReview rows={licences} choices={choices} targets={targets} onChoose={(hash, c) => setChoices(new Map(choices).set(hash, c))} />
        <div className="flex flex-col gap-1.25 rounded-ui-lg border border-ui-subtle bg-ui-chrome px-3.5 py-3">
          {contents.map(([a, b]) => (
            <div key={a} className="flex gap-3 text-caption">
              <span className="w-35 font-ui-mono text-caption text-ui-2">{a}</span>
              <span className="text-ui-3">{b}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2.5 border-t border-ui-subtle px-5 py-3">
        <span className="font-ui-mono text-caption text-ui-2">{fileName}</span>
        <span className={cn("text-caption", error ? "text-ui-danger" : "text-ui-4")}>{error ?? busy ?? `≈ ${formatBytes(assetBytes + fontBytes)}`}</span>
        <span className="flex-1" />
        <button type="button" onClick={onClose} className="h-8 px-3 text-body text-ui-3 hover:text-ui-1">
          Cancel
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void run()}
          className="h-8 rounded-ui-md bg-ui-inverse px-4 text-body font-medium text-ui-inverse-fg disabled:opacity-60"
        >
          Export
        </button>
      </div>
    </>
  );
}

export function ExportDialog({ open, onOpenChange, zone, onDone }: ExportDialogProps) {
  const canvas = zone?.canvas;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-48px)] w-[min(720px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-14 border border-ui-strong bg-ui-panel font-ui text-ui-1 shadow-ui-modal outline-none">
          {open && zone && canvas ? (
            <ExportBody key={zone.id} canvas={canvas} onClose={() => onOpenChange(false)} onDone={onDone} />
          ) : (
            <p className="p-5 text-body text-ui-3">This screen has no InfoPanel page to export. Import an InfoPanel profile first.</p>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
