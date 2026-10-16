import { useEffect, useMemo, useState } from "react";
import { FontLoader, type FontRequest, type ResolvedFont } from "./font-loader.ts";
import { fetchCatalogs, findCandidates, searchName, type Catalogs, type FontCandidate } from "./font-sources.ts";
import { walkItems } from "./parse.ts";
import type { DisplayItem } from "./schema.ts";

interface PackFace {
  source: "pack" | "system";
  family: string;
  legacyFamily: string;
  face: string;
  url?: string;
}

const SAMPLE = "CPU 45°C · GPU 1,234 RPM · 12:30:45 PM";
const TEXT_KINDS = new Set(["Text", "Clock", "Calendar", "Sensor", "TableSensor"]);

/** A free source for a missing font: link, license, a preview from Fontsource's CDN, and the install command. */
function MissingFont({ request, catalogs }: { request: FontRequest; catalogs: Catalogs | null }) {
  const [preview, setPreview] = useState<string | null>(null);
  if (!catalogs) return null;
  const best: FontCandidate | undefined = findCandidates(request.font, catalogs)[0];
  if (!best) return <div>no free source: ask for the font file</div>;

  const load = async () => {
    const weight = best.weights?.includes(request.bold ? 700 : 400) ? (request.bold ? 700 : 400) : best.weights?.[0] ?? 400;
    const alias = `preview-${best.id}-${weight}`;
    // Bytes, not a url() string built from catalog data.
    const url = `https://cdn.jsdelivr.net/fontsource/fonts/${encodeURIComponent(best.id)}@latest/latin-${weight}-normal.woff2`;
    const face = new FontFace(alias, await (await fetch(url)).arrayBuffer());
    document.fonts.add(await face.load());
    setPreview(alias);
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
      )}
      <div>
        <code>npm run lab:font-get -- "{best.family}" --install</code>
      </div>
      {preview && <div style={{ fontFamily: `"${preview}"`, fontSize: 22 }}>{SAMPLE}</div>}
    </div>
  );
}

function useFonts() {
  const [loader, setLoader] = useState<FontLoader | null | undefined>(undefined);
  const [packs, setPacks] = useState<PackFace[]>([]);
  const [catalogs, setCatalogs] = useState<Catalogs | null>(null);
  useEffect(() => {
    fetchCatalogs().then(setCatalogs, () => setCatalogs(null));
    FontLoader.fetch().then(setLoader, () => setLoader(null));
    fetch("/fonts/index.json")
      .then((r) => (r.ok ? r.json() : { faces: [] }))
      .then((i: { faces: PackFace[] }) => setPacks(i.faces.filter((f) => f.source === "pack")))
      .catch(() => setPacks([]));
  }, []);
  return { loader, packs, catalogs };
}

export function FontPanel({ items }: { items: DisplayItem[] }) {
  const { loader, packs, catalogs } = useFonts();
  const [resolved, setResolved] = useState<Map<string, ResolvedFont>>(new Map());

  const requests = useMemo(() => {
    const out = new Map<string, { request: FontRequest; count: number; size: number }>();
    for (const { item } of walkItems(items)) {
      if (!TEXT_KINDS.has(item.kind) || !("Font" in item)) continue;
      const request = { font: item.Font, style: item.FontStyle, bold: item.Bold, italic: item.Italic };
      const k = JSON.stringify(request);
      const prev = out.get(k);
      out.set(k, { request, count: (prev?.count ?? 0) + 1, size: Math.max(prev?.size ?? 0, item.FontSize) });
    }
    return out;
  }, [items]);

  useEffect(() => {
    if (!loader) return;
    let stop = false;
    Promise.all([...requests].map(async ([k, { request }]) => [k, await loader.resolve(request)] as const)).then(
      (pairs) => !stop && setResolved(new Map(pairs)),
    );
    return () => {
      stop = true;
    };
  }, [loader, requests]);

  if (loader === undefined) return null;
  if (loader === null)
    return (
      <section>
        <h3>Fonts</h3>
        <p>
          No font reference. Run <code>npm run lab:fonts</code>, then tools/skia-fonts (see the lab README).
        </p>
      </section>
    );

  const installed = new Set(loader.fonts.families.map((f) => f.name.toLowerCase()));
  return (
    <section>
      <h3>Fonts</h3>
      <table>
        <thead>
          <tr>
            <th>Requested</th>
            <th>Items</th>
            <th>InfoPanel draws</th>
            <th>Via</th>
            <th>Sample</th>
          </tr>
        </thead>
        <tbody>
          {[...requests].map(([k, { request, count }]) => {
            const r = resolved.get(k);
            // A legacy name ("Spotify Mix Extrabold") resolved to its installed family is not missing.
            const wanted = searchName(request.font).toLowerCase();
            const missing =
              !installed.has(request.font.toLowerCase()) && !(wanted && r?.typeface.family.toLowerCase().startsWith(wanted));
            const inPack = missing
              ? packs.find((p) => [p.family, p.legacyFamily].some((n) => n.toLowerCase() === request.font.toLowerCase()))
              : undefined;
            return (
              <tr key={k}>
                <td>
                  {request.font}
                  {request.style && ` / ${request.style}`}
                  {request.bold && " · bold"}
                  {request.italic && " · italic"}
                  {missing && (
                    <div>
                      <em>not installed</em>
                      {inPack && ` — in pack ${inPack.url?.split("/")[3]}`}
                      <MissingFont request={request} catalogs={catalogs} />
                    </div>
                  )}
                </td>
                <td>{count}</td>
                <td>{r && `${r.typeface.family} ${r.typeface.weight}${r.typeface.slant !== "Upright" ? " " + r.typeface.slant : ""}`}</td>
                <td>
                  {r?.typeface.via}
                  {r && !r.exact && " (approx.)"}
                </td>
                <td style={r ? { ...r.css, fontSize: 22, whiteSpace: "nowrap" } : undefined}>{SAMPLE}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
