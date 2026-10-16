import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { entriesFromZip, loadExport, type ExportEntry, type ParsedExport } from "./archive.ts";
import { walkItems } from "./parse.ts";
import { FontPanel } from "./FontPanel.tsx";
import { ComparePanel } from "./ComparePanel.tsx";
import { useEditor } from "./editor/useEditor.ts";
import { useFontPlan } from "./useFontPlan.ts";
import type { ConvertContext } from "./native/convert.ts";
import { convertible, nativeLayer, sensorMap } from "./native/native.tsx";
import { groupId } from "./remap/remap.ts";
import "@/index.css";
import { groupBindings, indexCatalog, resolveAll, type Overrides } from "./remap/remap.ts";
import { RemapPanel } from "./remap/RemapPanel.tsx";
import { sensorState, useLiveCatalog, useNow, type SensorMode } from "./sensor-source.ts";
import { SensorPanel } from "./SensorPanel.tsx";
import type { BoundItem } from "./sensors.ts";

interface CorpusProfile {
  id: string;
  /** Where its entries are served: /corpus/<id> for exports, /local/<guid> for InfoPanel's installed profiles. */
  base?: string;
  file: string;
  bytes: number;
  entries: string[];
  skipped: string[];
  /** InfoPanel's own render of the profile, when one was supplied. */
  screenshot?: string | null;
}

const baseOf = (p: CorpusProfile) => p.base ?? `/corpus/${encodeURIComponent(p.id)}`;

function corpusEntries(p: CorpusProfile): ExportEntry[] {
  return p.entries.map((name) => ({
    name,
    read: async () => {
      const r = await fetch(`${baseOf(p)}/${name.split("/").map(encodeURIComponent).join("/")}`);
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    },
  }));
}

function Summary({ parsed, screenshot, assetBase }: { parsed: ParsedExport; screenshot: string | null; assetBase: string | null }) {
  const { profile, assets, issues } = parsed;
  const editor = useEditor(parsed.items);
  const items = editor.items;
  const fontPlan = useFontPlan(items);
  const [mode, setMode] = useState<SensorMode>("unbound");
  const [mock, setMock] = useState<ReadonlyMap<BoundItem, number>>(new Map());
  const live = useLiveCatalog(mode === "live");
  const now = useNow();
  // Remap (L2): the candidate index changes with the set of keys, the groups with
  // the set of bindings, not on every poll or every drag.
  const [overrides, setOverrides] = useState<Overrides>(new Map());
  const keysSig = Object.keys(live.catalog.sensors).join("\n");
  const index = useMemo(() => indexCatalog(live.catalog), [keysSig]);
  const groups = groupBindings(items);
  const groupsSig = groups.map((g) => `${g.id}=${g.paths.join(",")}`).join("\n");
  const stableGroups = useMemo(() => groups, [groupsSig]);
  const resolved = useMemo(() => resolveAll(stableGroups, index, overrides), [stableGroups, index, overrides]);
  const choose = (id: string, key: string | null) =>
    setOverrides((o) => {
      const next = new Map(o);
      if (key === null) next.delete(id);
      else next.set(id, key);
      return next;
    });
  const source = { mode, live, mock, resolved };
  const sensor = useCallback((item: BoundItem) => sensorState(item, { mode, live, mock, resolved }), [mode, live, mock, resolved]);
  // Native mode (L5): flagged items drawn by the app's widgets, reading the remapped keys.
  const convertCtx: ConvertContext = {
    fontScale: profile.FontScale,
    keyOf: (item) => resolved.get(groupId(item))?.key ?? null,
    assetUrl: (name) => (assetBase ? `${assetBase}/assets/${encodeURIComponent(name)}` : null),
  };
  const native = nativeLayer(items, convertCtx, mode === "live" ? sensorMap(live.catalog) : {});
  const counts = new Map<string, number>();
  for (const { item } of walkItems(items)) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  return (
    <section>
      <h2>{profile.Name}</h2>
      <p>
        {profile.Width}×{profile.Height}, background <code>{profile.BackgroundColor}</code>, FontScale{" "}
        {profile.FontScale.toFixed(2)}, {assets.size} assets
      </p>
      <p>Sensors: {mode} (change below)</p>
      <ComparePanel
        parsed={parsed}
        editor={editor}
        sensor={sensor}
        now={now}
        screenshot={screenshot}
        font={fontPlan.css}
        native={native}
        convertible={() => convertible(editor.present, convertCtx)}
      />
      {mode === "live" ? (
        <RemapPanel groups={stableGroups} resolved={resolved} index={index} overrides={overrides} onChoose={choose} onSelect={editor.select} />
      ) : (
        <p>
          <button onClick={() => setMode("live")}>Remap sensors</button> (uses the live Data API)
        </p>
      )}
      <table>
        <tbody>
          {[...counts].sort().map(([k, n]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Issues ({issues.length})</h3>
      <table>
        <tbody>
          {issues.map((i, n) => (
            <tr key={n}>
              <td>{i.code}</td>
              <td>{i.path}</td>
              <td>{i.kind}</td>
              <td>{i.name}</td>
              <td>
                <code>{i.field}</code>
              </td>
              <td>{i.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <FontPanel plan={fontPlan} />
      <SensorPanel
        items={items}
        source={source}
        now={now}
        onMode={setMode}
        onMock={(item, v) => setMock((m) => new Map(m).set(item, v))}
      />
    </section>
  );
}

function Lab() {
  const [corpus, setCorpus] = useState<CorpusProfile[]>([]);
  const [installed, setInstalled] = useState<CorpusProfile[]>([]);
  const [parsed, setParsed] = useState<ParsedExport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loads, setLoads] = useState(0);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [assetBase, setAssetBase] = useState<string | null>(null);

  useEffect(() => {
    fetch("/corpus/index.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setCorpus, (e: Error) => setError(`No corpus (${e.message}). Run npm run lab:extract.`));
    // Profiles installed in InfoPanel on this machine (local-data-plugin.ts).
    fetch("/local/index.json")
      .then((r) => (r.ok ? r.json() : []))
      .then(setInstalled, () => setInstalled([]));
  }, []);
  const all = [...corpus, ...installed];

  /** `base`: where the profile's entries are served (corpus and installed profiles), for native image widgets. */
  const open = (entries: Promise<ExportEntry[]>, shot: string | null = null, base: string | null = null) => {
    setScreenshot(shot);
    setAssetBase(base);
    setParsed(null);
    setError(null);
    setLoads((n) => n + 1);
    entries.then(loadExport).then(setParsed, (e: Error) => setError(e.message));
  };

  return (
    <main>
      <h1>InfoPanel import lab</h1>
      <p>
        <select defaultValue="" onChange={(e) => {
            const p = all[Number(e.target.value)];
            open(Promise.resolve(corpusEntries(p)), p.screenshot ? `${baseOf(p)}/${p.screenshot}` : null, baseOf(p));
          }}>
          <option value="" disabled>
            Profile…
          </option>
          <optgroup label="Corpus exports">
            {corpus.map((p, i) => (
              <option key={p.id} value={i}>
                {p.id}
                {p.screenshot ? " (screenshot)" : ""}
              </option>
            ))}
          </optgroup>
          {installed.length > 0 && (
            <optgroup label="Installed in InfoPanel">
              {installed.map((p, i) => (
                <option key={p.base} value={corpus.length + i}>
                  {p.id}
                </option>
              ))}
            </optgroup>
          )}
        </select>{" "}
        or{" "}
        <input
          type="file"
          accept=".infopanel"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) open(f.arrayBuffer().then((b) => entriesFromZip(new Uint8Array(b))));
          }}
        />
      </p>
      {error && <p>{error}</p>}
      {parsed && <Summary key={loads} parsed={parsed} screenshot={screenshot} assetBase={assetBase} />}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Lab />);
