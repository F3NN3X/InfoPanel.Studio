import { useEffect, useMemo, useState } from "react";
import { FontLoader, type FontRequest, type ResolvedFont } from "./font-loader.ts";
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

function useFonts() {
  const [loader, setLoader] = useState<FontLoader | null | undefined>(undefined);
  const [packs, setPacks] = useState<PackFace[]>([]);
  useEffect(() => {
    FontLoader.fetch().then(setLoader, () => setLoader(null));
    fetch("/fonts/index.json")
      .then((r) => (r.ok ? r.json() : { faces: [] }))
      .then((i: { faces: PackFace[] }) => setPacks(i.faces.filter((f) => f.source === "pack")))
      .catch(() => setPacks([]));
  }, []);
  return { loader, packs };
}

export function FontPanel({ items }: { items: DisplayItem[] }) {
  const { loader, packs } = useFonts();
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
            const missing = !installed.has(request.font.toLowerCase());
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
