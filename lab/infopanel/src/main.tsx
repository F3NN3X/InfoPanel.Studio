import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { entriesFromZip, loadExport, type ExportEntry, type ParsedExport } from "./archive.ts";
import { walkItems } from "./parse.ts";
import { FontPanel } from "./FontPanel.tsx";
import { ComparePanel } from "./ComparePanel.tsx";
import { useEditor } from "./editor/useEditor.ts";
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

function Summary({ parsed, screenshot }: { parsed: ParsedExport; screenshot: string | null }) {
  const { profile, assets, issues } = parsed;
  const editor = useEditor(parsed.items);
  const items = editor.items;
  const [mode, setMode] = useState<SensorMode>("unbound");
  const [mock, setMock] = useState<ReadonlyMap<BoundItem, number>>(new Map());
  const live = useLiveCatalog(mode === "live");
  const now = useNow();
  const source = { mode, live, mock };
  const sensor = useCallback((item: BoundItem) => sensorState(item, { mode, live, mock }), [mode, live, mock]);
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
      <ComparePanel parsed={parsed} editor={editor} sensor={sensor} now={now} screenshot={screenshot} />
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
      <FontPanel items={items} />
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

  const open = (entries: Promise<ExportEntry[]>, shot: string | null = null) => {
    setScreenshot(shot);
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
            open(Promise.resolve(corpusEntries(p)), p.screenshot ? `${baseOf(p)}/${p.screenshot}` : null);
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
      {parsed && <Summary key={loads} parsed={parsed} screenshot={screenshot} />}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Lab />);
