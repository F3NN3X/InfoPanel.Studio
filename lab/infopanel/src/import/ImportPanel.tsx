/**
 * The import flow end to end (L8): the default mode, the import report, and
 * the stored form the app will save (saved and reopened here as a zip), plus
 * an export back to `.infopanel`, where vector gauges can be baked into frames.
 */
import { useEffect, useState } from "react";
import { analyse, assetFile, type Doc } from "@/lib/infopanel/assets/assets.ts";
import { itemAt, setField, type Path } from "@/lib/infopanel/editor/ops.ts";
import type { Editor } from "../editor/useEditor.ts";
import { infopanelExport } from "@/lib/infopanel/export/write.ts";
import { reviewFont, VERDICT_LABEL } from "@/lib/infopanel/font-licence.ts";
import { bakeSignature, gaugePaths, isStale, safeStem, setFrameFiles, vectorOf } from "@/lib/infopanel/gauges/frames.ts";
import { bake } from "@/lib/infopanel/gauges/raster.ts";
import type { ConvertContext } from "@/lib/infopanel/native/convert.ts";
import { convertible, isNative } from "@/lib/infopanel/native/modes.ts";
import type { Issue } from "@/lib/infopanel/parse.ts";
import type { Group, Overrides } from "@/lib/infopanel/remap/remap.ts";
import type { GaugeItem, Profile } from "@/lib/infopanel/schema.ts";
import { DATA_API } from "@/lib/infopanel/sensors.ts";
import type { Match } from "@/lib/infopanel/sensors.ts";
import type { FontPlan } from "../useFontPlan.ts";
import { bundle } from "@/lib/infopanel/import/bundle.ts";
import { buildReport, dataApiInfo } from "@/lib/infopanel/import/report.ts";
import { remapKeys, toStored, type DataApiInfo, type DefaultMode, type StoredCanvas, type StoredFont } from "@/lib/infopanel/import/stored.ts";

export interface ImportSource {
  name: string;
  origin: StoredCanvas["source"]["origin"];
}

export interface ImportPanelProps {
  editor: Editor;
  profile: Profile;
  issues: readonly Issue[];
  groups: readonly Group[];
  resolved: ReadonlyMap<string, Match | null>;
  overrides: Overrides;
  /** The remap only resolves against the live Data API. */
  live: boolean;
  onLive(): void;
  fonts: FontPlan;
  convertCtx: ConvertContext;
  source: ImportSource;
  defaultMode: DefaultMode;
  onDefaultMode(mode: DefaultMode): void;
}

function download(name: string, data: Uint8Array) {
  const url = URL.createObjectURL(new Blob([data.slice()], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const fileStem = (s: string) => s.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "profile";
const kb = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);

/** Sets every item's mode as one undo step: native where it converts, or none. */
function applyMode(editor: Editor, ctx: ConvertContext, native: boolean) {
  const targets = native ? new Set(convertible(editor.present, ctx)) : new Set<Path>();
  let items = editor.present;
  const visit = (list: readonly unknown[], prefix: string) =>
    list.forEach((_, i) => {
      const path = prefix ? `${prefix}.${i}` : String(i);
      const item = itemAt(items, path)!;
      if (item.kind !== "Group" && isNative(item) !== targets.has(path)) items = setField(items, path, "native", targets.has(path));
      if (item.kind === "Group") visit(item.DisplayItems, path);
    });
  visit(editor.present, "");
  editor.apply(items);
}

/** What each font request draws with, and the supplied files by hash. */
async function storedFonts(plan: FontPlan): Promise<{ fonts: StoredFont[]; files: Map<string, Uint8Array> }> {
  const files = new Map<string, Uint8Array>();
  const fonts: StoredFont[] = [];
  for (const row of plan.rows) {
    const f = row.use === "supplied" ? row.supplied : null;
    if (!f) {
      fonts.push({ request: row.request, use: "infopanel" });
      continue;
    }
    const bytes = new Uint8Array(await (await fetch(f.url)).arrayBuffer());
    const { hash } = await assetFile(f.file, bytes, "added");
    files.set(hash, bytes);
    fonts.push({
      request: row.request,
      use: "supplied",
      supplied: { hash, file: f.file.replace(/^.*\//, ""), index: f.index, family: f.family, face: f.face, ...(f.license ? { license: f.license } : {}) },
    });
  }
  return { fonts, files };
}

export function ImportPanel(props: ImportPanelProps) {
  const { editor, convertCtx } = props;
  const [api, setApi] = useState<DataApiInfo | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [bakeOnExport, setBakeOnExport] = useState(true);
  const [dropUnused, setDropUnused] = useState(true);

  useEffect(() => {
    fetch(`${DATA_API}/api/sensors`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((s: { sensors: Record<string, { ref?: string; table?: unknown }> }) => setApi(dataApiInfo(DATA_API, s.sensors, props.fonts.loader?.api ?? null)))
      .catch(() => setApi(null));
  }, [props.fonts.loader]);

  const doc: Doc = { items: editor.present, assets: editor.assets };
  const report = buildReport({
    doc, issues: props.issues, groups: props.groups, resolved: props.resolved, overrides: props.overrides,
    fontRows: props.fonts.rows, convertCtx, dataApi: api,
  });

  const run = (what: string, work: () => Promise<string | void>) => {
    setNote(`${what}…`);
    work().then(
      (m) => setNote(m || null),
      (e: Error) => setNote(`${what} failed: ${e.message}`),
    );
  };

  const choose = (mode: DefaultMode) => {
    props.onDefaultMode(mode);
    // "Both" keeps each item as it is here: the app makes one canvas of each mode.
    if (mode !== "both") applyMode(editor, convertCtx, mode === "native");
  };

  const save = () =>
    run("Saving the stored form", async () => {
      const { fonts, files } = await storedFonts(props.fonts);
      const stored = toStored({
        name: props.source.name, origin: props.source.origin, dataApi: api, defaultMode: props.defaultMode,
        profile: props.profile, items: editor.present, assets: editor.assets, keyOf: remapKeys(props.resolved, props.overrides), fonts,
      });
      download(`${fileStem(props.profile.Name)}.canvas.zip`, bundle(stored, editor.assets, files));
      // The saved canvas carries its supplied fonts: say which ones are not clearly free to share (L12).
      const flagged = [
        ...new Set(
          props.fonts.rows.flatMap((r) => {
            const f = r.use === "supplied" ? r.supplied : null;
            const review = f && reviewFont({ license: f.license ?? f.licenseText, licenseUrl: f.licenseUrl, embedding: f.embedding });
            return review && review.verdict !== "share" ? [`${f.file.replace(/^.*\//, "")} (${VERDICT_LABEL[review.verdict]})`] : [];
          }),
        ),
      ];
      const fontsNote = flagged.length ? `; it holds fonts to review before sharing it: ${flagged.join(", ")}` : "";
      return (props.live ? "Saved" : "Saved without sensor keys: the Data API was not used (Check sensors first)") + fontsNote;
    });

  const stale = gaugePaths(editor.present).filter((p) => isStale(itemAt(editor.present, p)));
  const exportInfoPanel = () =>
    run("Exporting", async () => {
      let next = doc;
      if (bakeOnExport) {
        for (const path of stale) {
          const g = itemAt(next.items, path) as GaugeItem;
          const spec = vectorOf(g)!;
          const count = g.Images.length > 1 ? g.Images.length : 101;
          setNote(`Baking ${g.Name || path}…`);
          next = setFrameFiles(next, path, await bake(spec, count, safeStem(g.Name)), bakeSignature(spec, count));
        }
        // The baked frames stay in the profile: one undo step.
        if (next !== doc) editor.applyDoc(next);
      }
      const unused = new Set(dropUnused ? analyse(next).unused.map((n) => n.toLowerCase()) : []);
      const files = [...next.assets.values()].filter((f) => !unused.has(f.name.toLowerCase()));
      download(`${fileStem(props.profile.Name)}.infopanel`, infopanelExport(props.profile, next.items, files.map((f) => ({ name: f.name, bytes: f.bytes }))));
      const left = bakeOnExport ? 0 : stale.length;
      return `Exported ${files.length} assets${left ? `; ${left} vector gauge(s) without up-to-date frames show their old frames (or nothing) in InfoPanel` : ""}`;
    });

  const statuses = Object.entries(report.sensors.byStatus).map(([k, n]) => `${n} ${k}`).join(", ");
  return (
    <section style={{ border: "1px solid #446", padding: "4px 12px", margin: "8px 0" }}>
      <h3>Import</h3>
      <p>
        Default mode:{" "}
        {(
          [
            ["infopanel", "Faithful (all InfoPanel)"],
            ["native", "Native where possible"],
            ["both", "Both (one canvas of each in the app)"],
          ] as const
        ).map(([m, label]) => (
          <label key={m} style={{ marginRight: 12 }}>
            <input type="radio" name="import-mode" checked={props.defaultMode === m} onChange={() => choose(m)} /> {label}
          </label>
        ))}
      </p>
      <ul>
        <li>
          Data API:{" "}
          {api ? (
            <>
              {api.url}: {api.ref ? "exact sensor refs" : <b>no sensor refs (Libre and HWiNFO match by name)</b>}, {api.tables ? "structured tables" : "flattened tables"},{" "}
              {api.fonts ? "font endpoints" : "no font endpoints"}
            </>
          ) : (
            <b>not reachable at {DATA_API}</b>
          )}
        </li>
        <li>
          Items: {report.items.total} ({Object.entries(report.items.byKind).map(([k, n]) => `${n} ${k}`).join(", ")}). Native where possible: {report.native.possible}; the rest stay InfoPanel
          {report.native.stays.length > 0 && <> ({report.native.stays.map((s) => `${s.count} ${s.reason}`).join(", ")})</>}.
          {report.native.needs.length > 0 && (
            <> App work native mode asks for (studio prototypes until then): {report.native.needs.map((n) => `${n.need} (${n.count})`).join(", ")}.</>
          )}
        </li>
        <li>
          Sensors:{" "}
          {props.live ? (
            <>
              {report.sensors.groups} sensors read by {report.sensors.items} items: {statuses || "none"}.{" "}
              {report.sensors.attention > 0 && <b>{report.sensors.attention} to check in Remap sensors.</b>}
            </>
          ) : (
            <>
              {report.sensors.groups} sensors, not matched yet. <button onClick={props.onLive}>Check sensors</button> (uses the live Data API)
            </>
          )}
        </li>
        <li>
          Assets: {report.assets.files} files, {kb(report.assets.bytes)}
          {report.assets.unused > 0 && `, ${report.assets.unused} unused`}
          {report.assets.duplicates > 0 && `, ${report.assets.duplicates} duplicates`}
          {report.assets.missing.length > 0 && <b>, missing: {report.assets.missing.join(", ")}</b>}
          {report.assets.urls > 0 && `, ${report.assets.urls} images from URLs`}
          {report.assets.absolute.length > 0 && <b>, {report.assets.absolute.length} absolute paths from the exporting machine (placeholder)</b>}.
        </li>
        <li>
          Fonts: {report.fonts.requests} requests
          {report.fonts.supplied > 0 && `, ${report.fonts.supplied} drawn with a supplied face`}
          {report.fonts.missing.length > 0 ? <b>; missing: {report.fonts.missing.join(", ")}</b> : "; none missing"}.
        </li>
        <li>
          Gauges: {report.gauges.total}
          {report.gauges.vector > 0 && `, ${report.gauges.vector} vector (live in the studio)`}
          {report.gauges.withoutFrames > 0 && `, ${report.gauges.withoutFrames} without up-to-date InfoPanel frames`}.
        </li>
        <li>
          Parse issues: {Object.keys(report.issues).length ? Object.entries(report.issues).map(([k, n]) => `${n} ${k}`).join(", ") : "none"}.
        </li>
      </ul>
      <p>
        <button onClick={save} title="The form the app's canvas zone saves, with its files: canvas.json, assets/ and fonts/ by SHA-256">
          Save stored form
        </button>{" "}
        · <button onClick={exportInfoPanel}>Export .infopanel</button>{" "}
        <label title="Vector gauges are drawn live in the studio; InfoPanel needs PNG frames">
          <input type="checkbox" checked={bakeOnExport} onChange={() => setBakeOnExport(!bakeOnExport)} /> bake {stale.length} vector gauge(s) for InfoPanel
        </label>{" "}
        <label>
          <input type="checkbox" checked={dropUnused} onChange={() => setDropUnused(!dropUnused)} /> leave unused assets out
        </label>{" "}
        {note && <em>{note}</em>}
      </p>
    </section>
  );
}
