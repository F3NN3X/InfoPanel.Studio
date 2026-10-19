import { useEffect, useState } from "react";
import type { FontRequest } from "@/lib/infopanel/font-loader.ts";
import { labFetch } from "./lab-fetch.ts";
import { fetchCatalogs, findCandidates, type Catalogs, type FontCandidate } from "@/lib/infopanel/font-sources.ts";
import type { FontRow, SuppliedFace } from "@/lib/infopanel/font-supply.ts";
import type { FontPlan } from "./useFontPlan.ts";

const SAMPLE = "CPU 45°C · GPU 1,234 RPM · 12:30:45 PM";

const describe = (r: FontRequest) =>
  `${r.font}${r.style ? ` / ${r.style}` : ""}${r.bold ? " · bold" : ""}${r.italic ? " · italic" : ""}`;
const faceText = (f: SuppliedFace) => `${f.family} ${f.face} (${f.origin}: ${f.file.split("/").pop()})`;

/** Free sources for a missing family: link, license, a preview from Fontsource's CDN, and a download into the library. */
function Sources({ family, bold, catalogs, onDownload }: { family: string; bold: boolean; catalogs: Catalogs | null; onDownload(c: FontCandidate): Promise<void> }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!catalogs) return null;
  const candidates = findCandidates(family, catalogs);
  const best = candidates[0];
  // Fontsource's catalog lists Google families too ("google" here) and serves their files with CORS;
  // Google's own download server does not, so the browser downloads every catalog entry from Fontsource.
  const listed = candidates.find((c) => c.source !== "fontsquirrel");
  const fontsource = listed && { ...listed, source: "fontsource" as const };
  if (!best) return <div>No free source found: ask the profile's author for the font file, then upload it.</div>;

  const load = async () => {
    const weight = best.weights?.includes(bold ? 700 : 400) ? (bold ? 700 : 400) : (best.weights?.[0] ?? 400);
    const alias = `preview-${best.id}-${weight}`;
    // Bytes, not a url() string built from catalog data.
    const url = `https://cdn.jsdelivr.net/fontsource/fonts/${encodeURIComponent(best.id)}@latest/latin-${weight}-normal.woff2`;
    const face = new FontFace(alias, await (await fetch(url)).arrayBuffer());
    document.fonts.add(await face.load());
    setPreview(alias);
  };
  const get = async () => {
    setBusy("downloading…");
    try {
      await onDownload(fontsource!);
      setBusy(null);
    } catch (e) {
      setBusy(`download failed: ${(e as Error).message}`);
    }
  };
  return (
    <div>
      <a href={best.page} target="_blank" rel="noreferrer">
        {best.family}
      </a>{" "}
      ({best.source}, {best.license}
      {!best.open && ", check license"}){" "}
      {best.source !== "fontsquirrel" && !preview && (
        <button type="button" onClick={load}>
          Preview
        </button>
      )}{" "}
      {fontsource && (
        <button type="button" disabled={busy === "downloading…"} onClick={get} title="Downloads the family from Fontsource into the lab's font library">
          Get from Fontsource
        </button>
      )}{" "}
      {busy}
      <div>
        Install for InfoPanel: <code>npm run lab:font-get -- "{best.family}" --install</code>
      </div>
      {preview && <div style={{ fontFamily: `"${preview}"`, fontSize: 22 }}>{SAMPLE}</div>}
    </div>
  );
}

function Row({ row, plan }: { row: FontRow; plan: FontPlan }) {
  const r = row.resolved;
  const drawn = r && `${r.typeface.family} ${r.typeface.weight}${r.typeface.slant !== "Upright" ? " " + r.typeface.slant : ""}`;
  const sampleCss = row.use === "supplied" ? plan.css({ font: row.request } as Parameters<FontPlan["css"]>[0]) : r?.css;
  return (
    <tr>
      <td>{describe(row.request)}</td>
      <td>{row.count}</td>
      <td>
        {drawn}
        {row.missing && <em title="InfoPanel draws another family: the font, or the named style, is not installed under that name"> (fallback: not found)</em>}
      </td>
      <td>
        {r?.typeface.via}
        {r && !r.exact && " (approx.)"}
        {r?.source === "reference" && " (reference file)"}
      </td>
      <td>
        {row.supplied ? (
          <select value={row.use} onChange={(e) => plan.choose(row.key, e.target.value as "infopanel" | "supplied")}>
            <option value="supplied">{faceText(row.supplied)}</option>
            <option value="infopanel">InfoPanel's fallback, as it shows now</option>
          </select>
        ) : row.missing ? (
          <em>nothing supplies it</em>
        ) : (
          "InfoPanel's face"
        )}
      </td>
      <td style={sampleCss ? { ...sampleCss, fontSize: 22, whiteSpace: "nowrap" } : undefined}>{SAMPLE}</td>
    </tr>
  );
}

export function FontPanel({ plan }: { plan: FontPlan }) {
  const [catalogs, setCatalogs] = useState<Catalogs | null>(null);
  useEffect(() => {
    fetchCatalogs(labFetch).then(setCatalogs, () => setCatalogs(null));
  }, []);

  if (plan.loader === undefined) return null;
  const source = plan.loader?.api ? `InfoPanel (Data API, ${plan.loader.api})` : plan.loader?.hasReference ? "the skia-fonts reference file" : null;
  return (
    <section>
      <h3>Fonts</h3>
      <p>
        {source ? <>Resolved by {source}.</> : <b>No font source: run InfoPanel with the font endpoints, or build the reference file (lab README).</b>}{" "}
        Library: {plan.library.length} faces ({plan.library.filter((f) => f.origin === "pack").length} from packs).{" "}
        <label>
          Add fonts <input type="file" multiple accept=".ttf,.otf,.ttc,.zip" onChange={(e) => e.target.files && void plan.addFiles(e.target.files)} />
        </label>
        {plan.rejected.length > 0 && <span> Not fonts, skipped: {plan.rejected.join(", ")}</span>}
        {catalogs && catalogs.unavailable.length > 0 && <span style={{ color: "#fc6" }}> Font sources unavailable: {catalogs.unavailable.join("; ")}</span>}
      </p>
      <table>
        <thead>
          <tr>
            <th>Requested</th>
            <th>Items</th>
            <th>InfoPanel draws</th>
            <th>Via</th>
            <th>Canvas draws</th>
            <th>Sample</th>
          </tr>
        </thead>
        <tbody>
          {plan.rows.map((row) => (
            <Row key={row.key} row={row} plan={plan} />
          ))}
        </tbody>
      </table>
      <h4>Missing fonts ({plan.missing.length})</h4>
      <p>
        <small>
          Fonts InfoPanel draws with another family. Usually the font is not installed; with a FontStyle it can also be a
          style name DirectWrite spells differently (localized names).
        </small>
      </p>
      {plan.missing.length === 0 ? (
        <p>InfoPanel has every font this profile asks for.</p>
      ) : (
        <table>
          <tbody>
            {plan.missing.map((m) => {
              const supplied = m.rows.filter((r) => r.supplied);
              return (
                <tr key={m.family}>
                  <td>
                    <b>{m.family}</b>
                    <div>
                      {m.items} items, {m.rows.length} styles
                    </div>
                  </td>
                  <td>
                    {supplied.length === m.rows.length ? (
                      <span style={{ color: "#6c6" }}>supplied by the library</span>
                    ) : supplied.length > 0 ? (
                      <span style={{ color: "#fc6" }}>
                        {supplied.length} of {m.rows.length} styles supplied
                      </span>
                    ) : (
                      <span style={{ color: "#f66" }}>not supplied</span>
                    )}
                    {supplied[0]?.supplied?.license && <div>License: {supplied[0].supplied.license}</div>}
                  </td>
                  <td>
                    <Sources family={m.family} bold={m.rows.some((r) => r.request.bold)} catalogs={catalogs} onDownload={plan.download} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
