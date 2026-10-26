/**
 * Export (§9): a canvas zone written as its stored form (`.canvas.zip`) or as an `.infopanel` for
 * InfoPanel. Baking first (stale vector gauges, rings and LED bars to frames; cards, glows, dividers
 * and icons to one image each) puts the new files on the zone as one undo step. What it reports about each part is
 * the editor's Export check (`exportCheck`), read from the items it writes, so the two never disagree.
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
import { bakeSignature, safeStem, setFrameFiles, vectorOf } from "@/lib/infopanel/gauges/frames";
import { bake } from "@/lib/infopanel/gauges/raster";
import { checkItems } from "@/lib/infopanel/export-check";
import { backdropLayers, backdropSignature } from "@/lib/infopanel/elements/backdrop";
import { elementSignature, setElementFile, staleElements, staticOf } from "@/lib/infopanel/elements/bake";
import { elementOf } from "@/lib/infopanel/elements/spec";
import { bakeElement } from "@/lib/infopanel/elements/raster";
import { fontsToInstall, sensorNote, sensorSources } from "@/lib/infopanel/export/needs";
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
  withSwapFiles,
  type FontChoice,
} from "@/lib/infopanel/export/studio-export";
import { extOverrides, openStored, type OpenedSource } from "@/lib/infopanel/import/session";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import type { GaugeItem } from "@/lib/infopanel/schema";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import { useSensorCatalog } from "@/lib/catalog";
import { widgetPaths } from "@/lib/infopanel/native/widget-item";
import { knownWidget, widgetPlacement } from "@/components/studio/placement-content";
import { CheckGroups } from "./export-check-panel";
import { FontLicenceReview } from "./font-licence-review";
import { Radio } from "./import/import-steps";
import { useSwapTargets } from "./use-swap-targets";

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

function ExportBody({ zone, canvas, onClose, onBaked, onDone }: { zone: Placement; canvas: StoredCanvas; onClose: () => void } & Pick<ExportDialogProps, "onBaked" | "onDone">) {
  const [opened, setOpened] = useState<OpenedSource | Error | null>(null);
  const [out, setOut] = useState<Output>("infopanel");
  const [bakeFirst, setBakeFirst] = useState(true);
  const [leaveUnused, setLeaveUnused] = useState(true);
  const licences = fontLicences(canvas, opened instanceof Error ? undefined : opened?.restore?.fontFiles);
  const [choices, setChoices] = useState<Map<string, FontChoice>>(() => new Map(licences.map((r) => [r.hash, defaultFontChoice(r)])));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const targets = useSwapTargets(out === "stored" && licences.some((r) => r.verdict === "keep"));
  const catalog = useSensorCatalog();

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
  // A blurred card is baked over what is behind it, so a change there (or to the blur) makes it stale.
  const backdropOf = (items: Doc["items"], assets: Doc["assets"]) => (path: string) => {
    const el = staticOf(itemAt(items, path));
    if (el?.spec.type !== "card" || !el.spec.blur) return undefined;
    const { BackgroundColor: bg, Width: width, Height: height } = opened.parsed.profile;
    return backdropSignature(el.spec.blur, backdropLayers(items, path, bg, assets, { width, height }));
  };
  const staleStatic = staleElements(doc.items, "", backdropOf(doc.items, doc.assets));
  const bakes = stale.length + staleStatic.length;
  const check = checkItems(doc.items, opened.origin !== "new");
  const surprises = check.rows.filter((r) => r.status !== "ok");
  const fonts = fontsToInstall(doc.items);
  const sensors = sensorNote(sensorSources(doc.items));
  const unused = unusedFiles(doc);
  const fontFiles = opened.restore?.fontFiles ?? new Map<string, Uint8Array>();
  const keptFonts = licences.filter((r) => choices.get(r.hash) !== "leave");
  const included = keptFonts.filter((r) => r.verdict === "keep" && typeof choices.get(r.hash) !== "object");
  const assetBytes = [...doc.assets.values()].reduce((n, f) => n + f.bytes.length, 0);
  const fontBytes = keptFonts.reduce((n, r) => {
    const c = choices.get(r.hash);
    return n + (typeof c === "object" ? c.swap.bytes.length : (fontFiles.get(r.hash)?.length ?? 0));
  }, 0);
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
        await download(fileName, canvasZip(stored, opened.assets, withSwapFiles(fontFiles, choices)), "application/zip");
        onDone(`Exported ${fileName}${included.length ? ` · it holds ${included.map((r) => r.family).join(", ")}, not cleared for sharing` : ""}`);
        onClose();
        return;
      }
      let next = doc;
      if (bakeFirst && bakes) {
        let done = 0;
        for (const path of stale) {
          const g = itemAt(next.items, path) as GaugeItem;
          const spec = vectorOf(g)!;
          const el = elementOf(g);
          const count = g.Images.length > 1 ? g.Images.length : el?.type === "ring" && el.frames ? el.frames : 101;
          const label = `Baking ${done + 1} of ${bakes}: ${g.Name || path}`;
          setBusy(`${label}…`);
          next = setFrameFiles(next, path, await bake(spec, count, safeStem(g.Name), (n) => setBusy(`${label}, frame ${n} of ${count}…`)), bakeSignature(spec, count));
          done++;
        }
        for (const path of staleStatic) {
          const item = itemAt(next.items, path);
          const el = staticOf(item);
          if (!item || !el) continue;
          setBusy(`Baking ${done + 1} of ${bakes}: ${item.Name || path}…`);
          const backdrop = el.spec.type === "card" && el.spec.blur ? { layers: backdropLayers(next.items, path, opened.parsed.profile.BackgroundColor, next.assets, { width: opened.parsed.profile.Width, height: opened.parsed.profile.Height }), assets: next.assets, at: { x: item.X, y: item.Y } } : undefined;
          next = setElementFile(next, path, await bakeElement(el.spec, el.width, el.height, item.Name, backdrop), elementSignature(el.spec, el.width, el.height, backdropOf(next.items, next.assets)(path)));
          done++;
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
      // Studio widgets go by their On InfoPanel rule, read from the editor's canvas; the screen keeps them as they are.
      let widgetNote = "";
      if (widgetPaths(next.items).length > 0) {
        setBusy("Converting Studio widgets…");
        const { exportWidgets } = await import("@/lib/infopanel/native/widget-export");
        const r = await exportWidgets(next, {
          root: document.querySelector("[data-canvas-edit-layer]")?.parentElement ?? null,
          sensors: catalog.sensors as unknown as Record<string, DataApiValue>,
          look: opened.parsed.profile,
          zoneOf: (w, id) => widgetPlacement(w, id),
          known: knownWidget,
        });
        next = r.doc;
        const unseen = r.report.filter((x) => x.outcome.includes("isn't drawn")).length;
        widgetNote = unseen ? ` · ${unseen} widget${unseen === 1 ? "" : "s"} left out: open the profile in Edit to export ${unseen === 1 ? "it" : "them"}` : "";
      }
      setBusy("Writing…");
      const leaveOut = leaveUnused ? unusedFiles(next).names : [];
      const file = infopanelFile(opened.parsed.profile, next, leaveOut);
      await download(fileName, file.bytes, "application/octet-stream");
      const left = bakeFirst ? 0 : bakes;
      onDone(`Exported ${fileName} · ${file.files} assets${left ? ` · ${left} gauges and elements keep their old images` : ""}${widgetNote}`);
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
                <span className="text-[12.5px] font-medium text-ui-1">Bake stale gauges and elements first</span>
                <span className={cn("text-[11.5px]", bakes ? "text-ui-warning" : "text-ui-4")}>
                  {bakes
                    ? [stale.length && `${stale.length} gauges, rings or LED bars need new frames`, staleStatic.length && `${staleStatic.length} cards, glows, dividers or icons need a new image`].filter(Boolean).join(" · ")
                    : "Every gauge’s frames and element’s image are up to date"}
                </span>
              </div>
              <Toggle on={bakeFirst} onChange={setBakeFirst} label="Bake stale gauges and elements first" />
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
        {out === "infopanel" && surprises.length > 0 && (
          <div className="flex flex-col gap-2 rounded-[10px] border border-ui-default px-3.5 py-3">
            <div className="text-[12.5px] font-medium text-ui-1">Export check</div>
            <CheckGroups rows={surprises} />
            <span className="text-[11.5px] text-ui-4">{check.counts.ok} more export as they are.</span>
          </div>
        )}
        {out === "infopanel" && (
          <div className="rounded-[10px] border border-ui-default px-3.5 py-3">
            <div className="text-[12.5px] font-medium text-ui-1">On the PC that opens it</div>
            <ul className="mt-1 space-y-0.5 text-[12px] text-ui-3">
              <li>
                {fonts.length > 0
                  ? `InfoPanel draws with installed fonts only, and an .infopanel carries none. Install ${fonts.join(", ")} there.`
                  : "Every font is one Windows ships with, so nothing needs installing."}
              </li>
              {sensors && <li>{sensors}</li>}
            </ul>
          </div>
        )}
        {out === "stored" && <FontLicenceReview rows={licences} choices={choices} targets={targets} onChoose={(hash, c) => setChoices(new Map(choices).set(hash, c))} />}
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
            <p className="p-5 text-[12.5px] text-ui-3">This screen has no canvas zone to export. Import an InfoPanel profile first.</p>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

