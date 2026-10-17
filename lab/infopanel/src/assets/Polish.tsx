/**
 * Asset polish (L12): optimising still images (re-encode, optionally as WebP
 * and smaller) and replacing many files at once by name. Each run is one undo
 * step; a re-encode is kept only when it saves at least 5 %.
 */
import { useState } from "react";
import type { Editor } from "../editor/useEditor.ts";
import { FileButton, IMAGE_ACCEPT, kb, readFiles, reencodable, reencode, type EncodeFormat } from "./asset-kit.tsx";
import { assetKey, replace, type AssetFile, type Doc } from "@/lib/infopanel/assets/assets.ts";
import { applyBulk, matchByName, resizeTarget, worthKeeping, type BulkPlan, type ResizeRule } from "@/lib/infopanel/assets/bulk.ts";

export function Polish({ editor, doc }: { editor: Editor; doc: Doc }) {
  const [format, setFormat] = useState<EncodeFormat>("same");
  const [quality, setQuality] = useState(85);
  const [rule, setRule] = useState<ResizeRule>({ kind: "keep" });
  const [plan, setPlan] = useState<BulkPlan | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const candidates = [...doc.assets.values()].filter((f) => reencodable(f) && f.width && f.height);

  const run = (what: string, work: () => Promise<string | void>) => {
    setNote(`${what}…`);
    work().then(
      (m) => setNote(m || null),
      (e: Error) => setNote(`${what} failed: ${e.message}`),
    );
  };

  const optimise = (files: AssetFile[]) =>
    run("Optimising", async () => {
      let next = doc;
      let saved = 0;
      const kept: string[] = [];
      for (const [i, f] of files.entries()) {
        setNote(`Optimising… ${i + 1}/${files.length}`);
        const out = await reencode(f, resizeTarget(f.width!, f.height!, rule), format, quality);
        if (!worthKeeping(f.bytes.length, out.bytes.length)) {
          kept.push(f.name);
          continue;
        }
        saved += f.bytes.length - out.bytes.length;
        next = replace(next, f.name, out);
      }
      if (next !== doc) editor.applyDoc(next);
      const done = files.length - kept.length;
      return `${done} optimised, ${kb(saved)} saved${kept.length ? `; ${kept.length} kept as they were (less than 5 % smaller)` : ""}`;
    });

  const ruleValue = rule.kind === "percent" ? rule.percent : rule.kind === "longest" ? rule.px : "";
  return (
    <>
      <h4>Optimise images</h4>
      <p>
        Encode as{" "}
        <select value={format} onChange={(e) => setFormat(e.target.value as EncodeFormat)}>
          <option value="same">same type (PNG lossless; JPEG / WebP at the quality)</option>
          <option value="webp">WebP (InfoPanel reads it)</option>
        </select>{" "}
        quality <input type="number" min={1} max={100} value={quality} style={{ width: 56 }} onChange={(e) => setQuality(Math.min(100, Math.max(1, Number(e.target.value) || 85)))} />{" "}
        size{" "}
        <select
          value={rule.kind}
          onChange={(e) => setRule(e.target.value === "percent" ? { kind: "percent", percent: 50 } : e.target.value === "longest" ? { kind: "longest", px: 512 } : { kind: "keep" })}
        >
          <option value="keep">keep</option>
          <option value="longest">longest side at most</option>
          <option value="percent">percent</option>
        </select>{" "}
        {rule.kind !== "keep" && (
          <input
            type="number"
            min={1}
            value={ruleValue}
            style={{ width: 64 }}
            onChange={(e) => {
              const v = Math.max(1, Number(e.target.value) || 1);
              setRule(rule.kind === "percent" ? { kind: "percent", percent: Math.min(100, v) } : { kind: "longest", px: v });
            }}
          />
        )}
        {rule.kind === "percent" ? " %" : rule.kind === "longest" ? " px" : ""}{" "}
        <button disabled={candidates.length === 0} onClick={() => optimise(candidates)} title="Animated images, video, SVG and icons are left alone">
          Optimise {candidates.length} still image{candidates.length === 1 ? "" : "s"}
        </button>{" "}
        {note && <em>{note}</em>}
      </p>
      <p>
        <small>Sizes below the drawn size make InfoPanel scale the image up; Cleanup's Downscale picks the drawn size.</small>
      </p>

      <h4>Replace by name</h4>
      <p>
        <FileButton
          multiple
          accept={IMAGE_ACCEPT}
          onFiles={(list) => run("Matching", async () => setPlan(matchByName(doc.assets, await readFiles(list))))}
        >
          Choose files…
        </FileButton>{" "}
        <small>Each replaces the profile file of the same name (or the same name with another extension), keeping its uses.</small>
      </p>
      {plan && (
        <div>
          <ul>
            {plan.matches.map((m) => (
              <li key={m.target}>
                {m.target} ← {m.file.name} ({kb(doc.assets.get(assetKey(m.target))!.bytes.length)} → {kb(m.file.bytes.length)}){m.byStem && " another type"}
              </li>
            ))}
            {plan.same.length > 0 && <li>Already the same: {plan.same.join(", ")}</li>}
            {plan.unmatched.length > 0 && <li>No file of that name: {plan.unmatched.join(", ")}</li>}
            {plan.ambiguous.length > 0 && <li>More than one match, left out: {plan.ambiguous.join(", ")}</li>}
          </ul>
          <button
            disabled={plan.matches.length === 0}
            onClick={() => {
              editor.applyDoc(applyBulk(doc, plan.matches));
              setNote(`${plan.matches.length} replaced`);
              setPlan(null);
            }}
          >
            Replace {plan.matches.length}
          </button>{" "}
          <button onClick={() => setPlan(null)}>Cancel</button>
        </div>
      )}
    </>
  );
}
