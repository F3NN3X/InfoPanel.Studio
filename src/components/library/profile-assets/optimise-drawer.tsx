/**
 * Optimise images (spec §3): format, quality and size cap, with a live before → after table. Animated
 * files are skipped, a re-encode under 5 % smaller is kept as it was. Apply is one edit of the doc.
 */
import { useEffect, useMemo, useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/assets";
import { replace, usesOf, type AssetFile, type Doc } from "@/lib/infopanel/assets/assets";
import { worthKeeping } from "@/lib/infopanel/assets/bulk";
import { optimiseTarget, type SizeCap } from "@/lib/infopanel/assets/stored-doc";
import type { Edit } from "./use-profile-doc";
import { BUTTON, Drawer, PRIMARY } from "./drawer";
import { reencodable, reencode, type EncodeFormat } from "./encode";

interface Result {
  after: AssetFile;
  keep: boolean;
}

export function OptimiseDrawer({ doc, onClose, onApply }: { doc: Doc; onClose: () => void; onApply: (edit: Edit) => void }) {
  const [format, setFormat] = useState<EncodeFormat>("same");
  const [quality, setQuality] = useState(85);
  const [cap, setCap] = useState<SizeCap>("none");
  const [results, setResults] = useState<ReadonlyMap<string, Result>>(new Map());
  const [working, setWorking] = useState(true);
  const files = useMemo(() => [...doc.assets.values()], [doc]);
  const uses = useMemo(() => usesOf(doc.items), [doc]);

  useEffect(() => {
    let live = true;
    setWorking(true);
    // Debounced: the slider fires on every step and each run re-encodes every still image.
    const timer = setTimeout(async () => {
      const next = new Map<string, Result>();
      for (const f of files.filter(reencodable)) {
        try {
          const after = await reencode(f, optimiseTarget(f, uses.get(f.name.toLowerCase()) ?? [], cap), format, quality);
          next.set(f.name, { after, keep: worthKeeping(f.bytes.length, after.bytes.length) });
        } catch {
          // A file the browser cannot decode stays as it is.
        }
        if (!live) return;
      }
      setResults(next);
      setWorking(false);
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [files, uses, format, quality, cap]);

  const kept = files.filter((f) => results.get(f.name)?.keep);
  const saved = kept.reduce((n, f) => n + f.bytes.length - results.get(f.name)!.after.bytes.length, 0);
  const apply = () => {
    const next = kept.reduce((d, f) => replace(d, f.name, results.get(f.name)!.after), doc);
    onApply({ doc: next, message: `${kept.length} optimised, ${formatBytes(saved)} saved` });
    onClose();
  };

  const status = (f: AssetFile): string | null => {
    if (f.animated) return "Animated, skipped";
    if (!reencodable(f)) return "Skipped";
    const r = results.get(f.name);
    if (!r) return working ? "…" : "Skipped";
    return r.keep ? null : "Kept as is (under 5 % smaller)";
  };

  return (
    <Drawer
      title="Optimise images"
      onClose={onClose}
      footer={
        <>
          <span className="min-w-0 flex-1 text-[12px] text-ui-3">{working ? "Working…" : `Saves ${formatBytes(saved)} across ${kept.length} file${kept.length === 1 ? "" : "s"}`}</span>
          <button type="button" onClick={onClose} className={BUTTON}>
            Cancel
          </button>
          <button type="button" disabled={working || kept.length === 0} onClick={apply} className={PRIMARY}>
            Apply
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block text-[12px] text-ui-3">
          <span className="mb-1.5 block">Format</span>
          <Segmented<EncodeFormat>
            label="Format"
            value={format}
            onChange={setFormat}
            options={[
              { value: "same", label: "Same type", title: "PNG lossless; JPEG and WebP at the quality" },
              { value: "webp", label: "WebP", title: "InfoPanel reads WebP" },
            ]}
          />
        </label>
        <label className="block text-[12px] text-ui-3">
          <span className="flex justify-between">
            Quality <span className="font-ui-mono text-ui-4">{quality}</span>
          </span>
          <input type="range" aria-label="Quality" min={1} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="mt-1 w-full accent-[var(--ui-accent)]" />
        </label>
        <label className="block text-[12px] text-ui-3">
          <span className="mb-1.5 block">Size cap</span>
          <Segmented<SizeCap>
            label="Size cap"
            value={cap}
            onChange={setCap}
            options={[
              { value: "none", label: "None" },
              { value: "drawn", label: "Drawn size", title: "Never below the size the screen draws it at" },
              { value: "half", label: "50 %" },
            ]}
          />
        </label>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[11px] text-ui-4">
              <th className="pb-1.5 font-normal">File</th>
              <th className="pb-1.5 text-right font-normal">Before → after</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => {
              const r = results.get(f.name);
              const note = status(f);
              return (
                <tr key={f.name} className="border-t border-ui-subtle">
                  <td className="max-w-0 truncate py-1.5 pr-2 font-ui-mono text-ui-2" title={f.name}>
                    {f.name}
                  </td>
                  <td className={cn("py-1.5 text-right font-ui-mono", note ? "text-ui-4" : "text-ui-2")}>
                    {note ?? `${formatBytes(f.bytes.length)} → ${formatBytes(r!.after.bytes.length)}`}
                    {!note && r && r.after.width !== f.width && <div className="text-[11px] text-ui-4">{`${f.width}×${f.height} → ${r.after.width}×${r.after.height}`}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Drawer>
  );
}
