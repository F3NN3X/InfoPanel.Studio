/**
 * Export (§9): a canvas zone written as its stored form (`.canvas.zip`) or as an `.infopanel` for
 * InfoPanel. Baking stale vector gauges first puts the new frames on the zone as one undo step.
 */
import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Archive, Share, TriangleAlert, X } from "lucide-react";
import { isTauri, saveBinaryFile } from "@/lib/desktop";
import { formatBytes, uploadBytes } from "@/lib/assets";
import type { Placement } from "@/lib/layout";
import { cn } from "@/lib/utils";
import type { Doc } from "@/lib/infopanel/assets/assets";
import { readStoreFile } from "@/lib/infopanel/canvas";
import { itemAt } from "@/lib/infopanel/editor/ops";
import { VERDICT_LABEL } from "@/lib/infopanel/font-licence";
import { bakeSignature, safeStem, setFrameFiles, vectorOf } from "@/lib/infopanel/gauges/frames";
import { bake } from "@/lib/infopanel/gauges/raster";
import {
  canvasZip,
  defaultFontChoice,
  fileStem,
  fontLicences,
  infopanelFile,
  restoreStored,
  staleGauges,
  unusedFiles,
  withFontChoices,
  type FontChoice,
} from "@/lib/infopanel/export/studio-export";
import { extOverrides, openStored, type OpenedSource } from "@/lib/infopanel/import/session";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import type { GaugeItem } from "@/lib/infopanel/schema";
import { Radio } from "./import/import-steps";

export interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The canvas zone to export (the selected one, else the profile's first). */
  zone: Placement | undefined;
  /** Baked frames back on the zone: one undo step. */
  onBaked: (zoneId: string, canvas: StoredCanvas) => void;
  /** A finished export, for a toast. */
  onDone: (message: string) => void;
}

type Output = "stored" | "infopanel";

/** Desktop: the native Save As (a cancel does nothing; an error falls back to the browser). Else a download. */
export async function download(name: string, data: Uint8Array, type: string): Promise<void> {
  if (isTauri()) {
    try {
      await saveBinaryFile(name, name.endsWith(".zip") ? "zip" : "infopanel", data);
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

function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("relative h-[18px] w-[30px] shrink-0 rounded-full transition-colors", on ? "bg-ui-accent" : "bg-[#34343b]")}
    >
      <span className={cn("absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-[left]", on ? "left-[14px]" : "left-0.5")} />
    </button>
  );
}

const LICENCE_TONE = { share: "text-ui-success", check: "text-ui-warning", keep: "text-ui-danger" };
const LICENCE_DOT = { share: "bg-ui-success", check: "bg-ui-warning", keep: "bg-ui-danger" };

function ExportBody({ zone, canvas, onClose, onBaked, onDone }: { zone: Placement; canvas: StoredCanvas; onClose: () => void } & Pick<ExportDialogProps, "onBaked" | "onDone">) {
  const [opened, setOpened] = useState<OpenedSource | Error | null>(null);
  const [out, setOut] = useState<Output>("infopanel");
  const [bakeFirst, setBakeFirst] = useState(true);
  const [leaveUnused, setLeaveUnused] = useState(true);
  const licences = fontLicences(canvas);
  const [choices, setChoices] = useState<Map<string, FontChoice>>(() => new Map(licences.map((r) => [r.hash, defaultFontChoice(r)])));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  const stem = fileStem(name);
  const fileName = out === "stored" ? `${stem}.canvas.zip` : `${stem}.infopanel`;
  if (!opened) return <p className="p-5 text-[12.5px] text-ui-3">Reading the canvas’s files…</p>;
  if (opened instanceof Error) return <p className="p-5 text-[12.5px] text-ui-danger">{opened.message}</p>;

  const doc: Doc = { items: opened.parsed.items, assets: opened.assets };
  const stale = staleGauges(doc.items);
  const unused = unusedFiles(doc);
  const fontFiles = opened.restore?.fontFiles ?? new Map<string, Uint8Array>();
  const keptFonts = licences.filter((r) => choices.get(r.hash) !== "leave");
  const included = keptFonts.filter((r) => r.verdict === "keep");
  const assetBytes = [...doc.assets.values()].reduce((n, f) => n + f.bytes.length, 0);
  const fontBytes = keptFonts.reduce((n, r) => n + (fontFiles.get(r.hash)?.length ?? 0), 0);
  const size = out === "stored" ? assetBytes + fontBytes : assetBytes - (leaveUnused ? unused.bytes : 0);
  const missing = opened.restore?.missing ?? [];
  const contents: [string, string][] =
    out === "stored"
      ? [
          ["canvas.json", "infopanel-canvas v1"],
          ["assets/", `${doc.assets.size} files · by SHA-256`],
          ["fonts/", `${keptFonts.length} files`],
        ]
      : [
          ["Profile.xml", `${opened.parsed.profile.Width} × ${opened.parsed.profile.Height}, background, font defaults`],
          ["DisplayItems.xml", `${countItems(doc.items)} items, InfoPanel field order`],
          ["assets/", `${doc.assets.size - (leaveUnused ? unused.names.length : 0)} files`],
        ];

  const run = async () => {
    setError(null);
    try {
      if (out === "stored") {
        const stored = withFontChoices(canvas, choices);
        await download(fileName, canvasZip(stored, opened.assets, fontFiles), "application/zip");
        onDone(`Exported ${fileName}${included.length ? ` · it holds ${included.map((r) => r.family).join(", ")}, not cleared for sharing` : ""}`);
        onClose();
        return;
      }
      let next = doc;
      if (bakeFirst && stale.length) {
        for (const path of stale) {
          const g = itemAt(next.items, path) as GaugeItem;
          const spec = vectorOf(g)!;
          const count = g.Images.length > 1 ? g.Images.length : 101;
          setBusy(`Baking ${g.Name || path}…`);
          next = setFrameFiles(next, path, await bake(spec, count, safeStem(g.Name)), bakeSignature(spec, count));
        }
        // The new frames go to the asset store, then onto the zone (one undo step).
        setBusy("Storing frames…");
        const ids = new Map<string, string>();
        const have = new Set([...doc.assets.values()].map((f) => f.hash));
        for (const f of next.assets.values()) {
          if (!have.has(f.hash) && !ids.has(f.hash)) ids.set(f.hash, (await uploadBytes(f.bytes, "image/png")).id);
        }
        const exts = extOverrides(next.assets, ids);
        const keys = opened.restore?.keys ?? new Map();
        onBaked(zone.id, restoreStored(canvas, opened.parsed.profile, next, keys, exts));
      }
      setBusy("Writing…");
      const leaveOut = leaveUnused ? unusedFiles(next).names : [];
      const file = infopanelFile(opened.parsed.profile, next, leaveOut);
      await download(fileName, file.bytes, "application/octet-stream");
      const left = bakeFirst ? 0 : stale.length;
      onDone(`Exported ${fileName} · ${file.files} assets${left ? ` · ${left} vector gauges keep their old frames` : ""}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const outputs: { value: Output; icon: typeof Archive; title: string; file: string; text: string }[] = [
    {
      value: "stored",
      icon: Archive,
      title: "Stored form",
      file: `${stem}.canvas.zip`,
      text: "Reopens here exactly as it is: mode, remap choices, fonts and assets, each checked by SHA-256.",
    },
    {
      value: "infopanel",
      icon: Share,
      title: ".infopanel for InfoPanel",
      file: `${stem}.infopanel`,
      text: "Profile.xml + DisplayItems.xml in InfoPanel’s field order, with assets. Native items go back as their InfoPanel fields.",
    },
  ];
  return (
    <>
      <div className="flex items-center border-b border-ui-subtle px-5 py-4">
        <Dialog.Title className="flex-1 text-[15px] font-semibold text-ui-1">Export {name}</Dialog.Title>
        <Dialog.Close title="Close" className="grid h-7 w-7 place-items-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1">
          <X className="h-5 w-5" />
        </Dialog.Close>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-auto px-5 py-[18px]">
        <div role="radiogroup" aria-label="Output" className="grid grid-cols-2 gap-2.5 max-sm:grid-cols-1">
          {outputs.map((o) => {
            const Icon = o.icon;
            const on = out === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setOut(o.value)}
                className={cn("flex flex-col gap-1.5 rounded-[10px] border p-3.5 text-left", on ? "border-ui-accent bg-ui-accent-soft" : "border-ui-default bg-ui-tile hover:bg-ui-hover")}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-ui-3" />
                  <span className="flex-1 text-[13px] font-semibold text-ui-1">{o.title}</span>
                  <Radio on={on} />
                </span>
                <span className="font-ui-mono text-[11.5px] text-ui-2">{o.file}</span>
                <span className="text-[12px] text-ui-4">{o.text}</span>
              </button>
            );
          })}
        </div>
        {missing.length > 0 && (
          <p className="flex gap-1.5 text-[12px] text-ui-warning">
            <TriangleAlert className="h-4 w-4 shrink-0" /> Not in the asset store, so not exported: {missing.join(", ")}
          </p>
        )}
        {out === "infopanel" && (
          <div className="flex flex-col rounded-[10px] border border-ui-default">
            <div className="flex items-center gap-3 border-b border-ui-subtle px-3.5 py-3">
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-[12.5px] font-medium text-ui-1">Bake stale vector gauges first</span>
                <span className={cn("text-[11.5px]", stale.length ? "text-ui-warning" : "text-ui-4")}>
                  {stale.length ? `${stale.length} gauges have frames out of date` : "Every gauge’s frames are up to date"}
                </span>
              </div>
              <Toggle on={bakeFirst} onChange={setBakeFirst} label="Bake stale vector gauges first" />
            </div>
            <div className="flex items-center gap-3 px-3.5 py-3">
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-[12.5px] font-medium text-ui-1">Leave unused assets out</span>
                <span className="text-[11.5px] text-ui-4">
                  {unused.names.length} files · {formatBytes(unused.bytes)}
                </span>
              </div>
              <Toggle on={leaveUnused} onChange={setLeaveUnused} label="Leave unused assets out" />
            </div>
          </div>
        )}
        {out === "infopanel" && (
          <p className="text-[11.5px] text-ui-4">InfoPanel draws with the fonts installed on its PC: an .infopanel carries no font files.</p>
        )}
        {out === "stored" && (
          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-semibold text-ui-1">Font licences</span>
            <span className="-mt-1 text-[11.5px] text-ui-4">Review the supplied fonts before sharing this file.</span>
            <div className="flex flex-col rounded-[10px] border border-ui-default">
              {licences.length === 0 && <span className="px-3.5 py-2.5 text-[12px] text-ui-4">No supplied fonts: the canvas draws InfoPanel’s faces.</span>}
              {licences.map((r) => {
                const choice = choices.get(r.hash) ?? "include";
                return (
                  <div key={r.hash} className="flex flex-col gap-2 border-b border-ui-subtle px-3.5 py-2.5 last:border-b-0">
                    <div className="flex items-center gap-2.5">
                      <span className={cn("h-[7px] w-[7px] rounded-full", LICENCE_DOT[r.verdict])} />
                      <span className="w-[140px] truncate text-[12.5px] font-medium text-ui-1">{r.family}</span>
                      <span className="flex-1 truncate text-[12px] text-ui-3" title={r.reason}>
                        Supplied · {r.file}
                      </span>
                      <span className={cn("text-[11.5px] capitalize", LICENCE_TONE[r.verdict])}>{VERDICT_LABEL[r.verdict]}</span>
                    </div>
                    {r.verdict !== "share" && (
                      <div role="radiogroup" aria-label={`${r.family} in the export`} className="ml-[17px] flex gap-0.5 self-start rounded-[7px] border border-ui-default bg-ui-raised p-0.5">
                        {(["include", "leave"] as const).map((c) => (
                          <button
                            key={c}
                            type="button"
                            role="radio"
                            aria-checked={choice === c}
                            onClick={() => setChoices(new Map(choices).set(r.hash, c))}
                            className={cn("whitespace-nowrap rounded-[5px] px-2.5 py-1 text-[12px]", choice === c ? "bg-ui-active text-ui-1" : "text-ui-4 hover:text-ui-1")}
                          >
                            {c === "include" ? "Include anyway" : "Leave out"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {included.length > 0 && (
              <span className="flex gap-1.5 text-[12px] text-ui-danger">
                <TriangleAlert className="h-4 w-4 shrink-0" />
                {included.map((r) => r.family).join(", ")}: the licence doesn’t allow sharing. The save note will name it.
              </span>
            )}
          </div>
        )}
        <div className="flex flex-col gap-[5px] rounded-[10px] border border-ui-subtle bg-ui-chrome px-3.5 py-3">
          {contents.map(([a, b]) => (
            <div key={a} className="flex gap-3 text-[12px]">
              <span className="w-[140px] font-ui-mono text-[11.5px] text-ui-2">{a}</span>
              <span className="text-ui-3">{b}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2.5 border-t border-ui-subtle px-5 py-3">
        <span className="font-ui-mono text-[12px] text-ui-2">{fileName}</span>
        <span className={cn("text-[11.5px]", error ? "text-ui-danger" : "text-ui-4")}>{error ?? busy ?? `≈ ${formatBytes(Math.max(0, size))}`}</span>
        <span className="flex-1" />
        <button type="button" onClick={onClose} className="h-8 px-3 text-[12.5px] text-ui-3 hover:text-ui-1">
          Cancel
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void run()}
          className="h-8 rounded-[7px] bg-ui-inverse px-4 text-[12.5px] font-semibold text-ui-inverse-fg disabled:opacity-60"
        >
          Export
        </button>
      </div>
    </>
  );
}

function countItems(items: readonly { kind: string; DisplayItems?: readonly unknown[] }[]): number {
  return items.reduce((n, i) => n + 1 + (i.kind === "Group" ? countItems((i.DisplayItems ?? []) as never) : 0), 0);
}

export function ExportDialog({ open, onOpenChange, zone, onBaked, onDone }: ExportDialogProps) {
  const canvas = zone?.canvas;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-48px)] w-[min(720px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[14px] border border-ui-strong bg-ui-panel font-ui text-ui-1 shadow-ui-modal outline-none">
          {open && zone && canvas ? (
            <ExportBody key={zone.id} zone={zone} canvas={canvas} onClose={() => onOpenChange(false)} onBaked={onBaked} onDone={onDone} />
          ) : (
            <p className="p-5 text-[12.5px] text-ui-3">This profile has no canvas zone to export. Import an InfoPanel profile first.</p>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

