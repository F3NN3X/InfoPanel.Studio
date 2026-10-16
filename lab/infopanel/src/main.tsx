import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { entriesFromZip, loadExport, type ExportEntry, type ParsedExport } from "./archive.ts";
import { walkItems } from "./parse.ts";
import { tableFromExport, type AssetTable } from "./assets/assets.ts";
import { AssetPanel } from "./assets/AssetPanel.tsx";
import { useStoreUrls } from "./assets/store.ts";
import { GaugePanel } from "./gauges/GaugePanel.tsx";
import { openBundle } from "./import/bundle.ts";
import { ImportPanel, type ImportSource } from "./import/ImportPanel.tsx";
import type { DefaultMode, StoredFont } from "./import/stored.ts";
import { requestKey } from "./font-supply.ts";
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

const servedUrl = (p: CorpusProfile, name: string) => `${baseOf(p)}/${name.split("/").map(encodeURIComponent).join("/")}`;

function corpusEntries(p: CorpusProfile): ExportEntry[] {
  return p.entries.map((name) => ({
    name,
    read: async () => {
      const r = await fetch(servedUrl(p, name));
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    },
  }));
}

interface Opened {
  parsed: ParsedExport;
  /** The export's asset files, read up front so the lab can edit them (L6). */
  assets: AssetTable;
  source: ImportSource;
  /** A saved canvas being reopened (L8): its decisions. */
  restore?: { overrides: Map<string, string>; fonts: StoredFont[]; fontFiles: Map<string, Uint8Array>; defaultMode: DefaultMode; missing: string[] };
}

function Summary({ parsed, assets: initialAssets, screenshot, source: importSource, restore }: Opened & { screenshot: string | null }) {
  const { profile, issues } = parsed;
  const editor = useEditor(parsed.items, initialAssets);
  const assets = editor.assets;
  const assetSource = useMemo(
    () => new Map([...assets].map(([k, f]) => [k, { hash: f.hash, read: async () => f.bytes }])),
    [assets],
  );
  const storeUrls = useStoreUrls(assets);
  const items = editor.items;
  const fontPlan = useFontPlan(items);
  const [mode, setMode] = useState<SensorMode>("unbound");
  const [mock, setMock] = useState<ReadonlyMap<BoundItem, number>>(new Map());
  const live = useLiveCatalog(mode === "live");
  const now = useNow();
  // Remap (L2): the candidate index changes with the set of keys, the groups with
  // the set of bindings, not on every poll or every drag.
  const [overrides, setOverrides] = useState<Overrides>(() => restore?.overrides ?? new Map());
  const [defaultMode, setDefaultMode] = useState<DefaultMode>(restore?.defaultMode ?? "infopanel");
  // A reopened canvas: its supplied font files back in the library, and its choices.
  useEffect(() => {
    if (!restore || restore.fonts.length === 0) return;
    const files = [...restore.fontFiles].map(([hash, bytes]) => {
      const name = restore.fonts.find((f) => f.supplied?.hash === hash)?.supplied?.file || `${hash.slice(0, 12)}.ttf`;
      return new File([bytes.slice()], name);
    });
    void fontPlan.addFiles(files).then(() => {
      for (const f of restore.fonts) fontPlan.choose(requestKey(f.request), f.use);
    });
  }, []);
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
    // The app's image widget loads served URLs: the export's own file, else the lab asset store's copy.
    assetUrl: (name) => {
      const f = assets.get(name.toLowerCase());
      return f ? (f.url ?? storeUrls.get(f.hash) ?? null) : null;
    },
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
      {restore && restore.missing.length > 0 && <p><b>Missing from the saved canvas: {restore.missing.join(", ")}</b></p>}
      <ImportPanel
        editor={editor}
        profile={profile}
        issues={issues}
        groups={stableGroups}
        resolved={resolved}
        overrides={overrides}
        live={mode === "live"}
        onLive={() => setMode("live")}
        fonts={fontPlan}
        convertCtx={convertCtx}
        source={importSource}
        defaultMode={defaultMode}
        onDefaultMode={setDefaultMode}
      />
      <ComparePanel
        parsed={parsed}
        editor={editor}
        sensor={sensor}
        now={now}
        screenshot={screenshot}
        font={fontPlan.css}
        native={native}
        convertible={() => convertible(editor.present, convertCtx)}
        assets={assetSource}
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
      <GaugePanel editor={editor} profileName={profile.Name} />
      <AssetPanel editor={editor} fonts={fontPlan} />
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
  const [opened, setOpened] = useState<Opened | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loads, setLoads] = useState(0);
  const [screenshot, setScreenshot] = useState<string | null>(null);

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

  /** `served`: the lab server's URL for an entry, for corpus and installed profiles. */
  const open = (entries: Promise<ExportEntry[]>, source: ImportSource, shot: string | null = null, served?: (entry: string) => string) => {
    setScreenshot(shot);
    setOpened(null);
    setError(null);
    setLoads((n) => n + 1);
    entries
      .then(loadExport)
      .then(async (parsed) => ({ parsed, assets: await tableFromExport(parsed.assets, served), source }))
      .then(setOpened, (e: Error) => setError(e.message));
  };

  /** A canvas saved by the Import panel (L8). */
  const openSaved = (file: File) => {
    setScreenshot(null);
    setOpened(null);
    setError(null);
    setLoads((n) => n + 1);
    file
      .arrayBuffer()
      .then((b) => openBundle(new Uint8Array(b)))
      .then(
        (o) =>
          setOpened({
            parsed: o.parsed,
            assets: o.assets,
            source: { name: o.read.stored.source.name, origin: o.read.stored.source.origin },
            restore: { overrides: o.overrides, fonts: o.read.stored.fonts, fontFiles: o.fonts, defaultMode: o.read.stored.defaultMode, missing: o.missing },
          }),
        (e: Error) => setError(e.message),
      );
  };

  return (
    <main>
      <h1>InfoPanel import lab</h1>
      <p>
        <select defaultValue="" onChange={(e) => {
            const p = all[Number(e.target.value)];
            open(Promise.resolve(corpusEntries(p)), { name: p.id, origin: p.base ? "installed" : "corpus" }, p.screenshot ? `${baseOf(p)}/${p.screenshot}` : null, (name) => servedUrl(p, name));
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
            if (f) open(f.arrayBuffer().then((b) => entriesFromZip(new Uint8Array(b))), { name: f.name.replace(/\.infopanel$/i, ""), origin: "file" });
          }}
        />{" "}
        or a saved canvas{" "}
        <input
          type="file"
          accept=".zip"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) openSaved(f);
          }}
        />
      </p>
      {error && <p>{error}</p>}
      {opened && <Summary key={loads} {...opened} screenshot={screenshot} />}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Lab />);
