/**
 * Gauges (L7): the profile's gauges, a preview at any value with InfoPanel's
 * frame pick and AnimationSpeed smoothing, frame editing (order, replace,
 * resample, recolour), vector gauges (spec, bake into frames) and the gauge
 * library. Every change is one undo step.
 */
import { useEffect, useRef, useState } from "react";
import { assetFile, type AssetFile, type AssetTable, type Doc } from "@/lib/infopanel/assets/assets.ts";
import { useObjectUrls } from "../assets/AssetPanel.tsx";
import { itemAt, setField, type Path } from "@/lib/infopanel/editor/ops.ts";
import type { Editor } from "../editor/useEditor.ts";
import { gaugeFrame, smoothIndex } from "@/lib/infopanel/render/geometry.ts";
import type { GaugeItem } from "@/lib/infopanel/schema.ts";
import {
  bakeSignature, duplicateOrder, frameNames, gaugePaths, insertFramesGauge, insertVectorGauge, isGauge, isStale, moveOrder,
  removeOrder, reorderFrames, resampleOrder, reverseOrder, safeStem, setFrameFile, setFrameFiles, setVector, vectorOf,
} from "@/lib/infopanel/gauges/frames.ts";
import { deleteEntry, entrySignature, fetchFrame, fetchLibrary, newId, saveEntry, type LibraryEntry } from "./library.ts";
import { bake, NO_RECOLOUR, recolourFilter, recolourFrames, type Recolour } from "@/lib/infopanel/gauges/raster.ts";
import { STARTERS } from "@/lib/infopanel/gauges/vector.ts";
import { VectorForm } from "./VectorForm.tsx";
import { VectorGaugeSvg } from "./VectorGaugeSvg.tsx";

const filesOf = (g: GaugeItem, assets: AssetTable) => frameNames(g).map((n) => (n ? assets.get(n) ?? null : null));

/**
 * The gauge at `p` (0..1) as InfoPanel draws it: the frame for the value,
 * moving toward it at AnimationSpeed frames a second with a crossfade.
 */
function FramesPreview({ frames, p, speed, size, filter, urlOf }: {
  frames: (AssetFile | null)[];
  p: number;
  speed: number;
  size: number;
  filter?: string;
  urlOf(f: AssetFile): string;
}) {
  const target = gaugeFrame(frames.length, p * 100, 0, 100);
  const [index, setIndex] = useState(target);
  const last = useRef(performance.now());
  useEffect(() => {
    let frame = requestAnimationFrame(function tick(now) {
      const dt = (now - last.current) / 1000;
      last.current = now;
      setIndex((i) => smoothIndex(i, target, speed, dt, frames.length));
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, speed, frames.length]);
  const [lo, hi] = [Math.floor(index), Math.ceil(index)];
  const a = frames[lo];
  const b = hi !== lo ? frames[hi] : null;
  const img = (f: AssetFile, opacity: number) => (
    <img src={urlOf(f)} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", opacity, filter }} />
  );
  return (
    <div style={{ position: "relative", width: size, height: size, background: "repeating-conic-gradient(#2a2a2a 0 25%, #1c1c1c 0 50%) 0 0 / 16px 16px" }}>
      {a ? img(a, 1) : <em>no frame</em>}
      {b && img(b, index - lo)}
    </div>
  );
}

function FrameStrip({ g, path, editor, doc, urlOf, run }: {
  g: GaugeItem;
  path: Path;
  editor: Editor;
  doc: Doc;
  urlOf(f: AssetFile): string;
  run(what: string, work: () => Promise<string | void>): void;
}) {
  const files = filesOf(g, doc.assets);
  const n = g.Images.length;
  const [count, setCount] = useState(n);
  const order = (o: number[]) => editor.apply(reorderFrames(editor.present, path, o));
  const replace = (i: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) run("Replacing the frame", async () => editor.applyDoc(setFrameFile(doc, path, i, await assetFile(f.name, new Uint8Array(await f.arrayBuffer()), "added"))));
    };
    input.click();
  };
  return (
    <div>
      <p>
        {n} frames · <button onClick={() => order(reverseOrder(n))}>Reverse</button> · resample to{" "}
        <input type="number" min={1} max={1000} value={count} style={{ width: 64 }} onChange={(e) => setCount(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))} />{" "}
        <button disabled={count === n} onClick={() => order(resampleOrder(n, count))} title="Picks frames evenly; the first and last stay">
          Apply
        </button>
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 260, overflow: "auto" }}>
        {files.map((f, i) => (
          <figure key={i} style={{ margin: 0, width: 64, fontSize: 11, textAlign: "center" }}>
            {f ? <img src={urlOf(f)} alt={f.name} title={f.name} style={{ width: 64, height: 48, objectFit: "contain", display: "block", background: "#222" }} /> : <div style={{ height: 48, background: "#422" }} title="not an asset" />}
            <figcaption>
              {i}{" "}
              <button title="Earlier" disabled={i === 0} onClick={() => order(moveOrder(n, i, -1))}>‹</button>
              <button title="Later" disabled={i === n - 1} onClick={() => order(moveOrder(n, i, 1))}>›</button>
              <br />
              <button title="Duplicate" onClick={() => order(duplicateOrder(n, i))}>+</button>
              <button title="Remove" disabled={n === 1} onClick={() => order(removeOrder(n, i))}>✕</button>
              <button title="Replace with a file" onClick={() => replace(i)}>…</button>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function RecolourTool({ g, path, editor, doc, onFilter, run }: {
  g: GaugeItem;
  path: Path;
  editor: Editor;
  doc: Doc;
  onFilter(filter: string | undefined): void;
  run(what: string, work: () => Promise<string | void>): void;
}) {
  const [r, setR] = useState<Recolour>(NO_RECOLOUR);
  useEffect(() => onFilter(r === NO_RECOLOUR ? undefined : recolourFilter(r)), [r]);
  useEffect(() => () => onFilter(undefined), []);
  const slider = (key: keyof Recolour, min: number, max: number, unit: string) => (
    <label style={{ marginRight: 12 }}>
      {key}{" "}
      <input type="range" min={min} max={max} value={r[key]} onChange={(e) => setR({ ...r, [key]: Number(e.target.value) })} /> {r[key]}
      {unit}
    </label>
  );
  return (
    <p>
      Recolour: {slider("hue", -180, 180, "°")}
      {slider("saturation", 0, 300, "%")}
      {slider("brightness", 0, 300, "%")}
      <button disabled={r === NO_RECOLOUR} onClick={() => setR(NO_RECOLOUR)}>Reset</button>{" "}
      <button
        disabled={r === NO_RECOLOUR}
        onClick={() =>
          run("Recolouring", async () => {
            const files = filesOf(g, doc.assets);
            if (files.some((f) => !f)) return "Some frames are not assets of this profile; nothing changed";
            editor.applyDoc(setFrameFiles(doc, path, await recolourFrames(files as AssetFile[], r)));
            setR(NO_RECOLOUR);
          })
        }
      >
        Apply to every frame
      </button>
    </p>
  );
}

/** The frames of a gauge for the library: each file's hash and bytes. */
function framesForLibrary(g: GaugeItem, assets: AssetTable) {
  const files = filesOf(g, assets);
  if (files.length === 0 || files.some((f) => !f)) return null;
  const list = files as AssetFile[];
  return { frames: list.map((f) => ({ hash: f.hash, name: f.name })), bytes: new Map(list.map((f) => [f.hash, f.bytes])) };
}

function entryFor(g: GaugeItem, assets: AssetTable, name: string, source: string): { entry: LibraryEntry; bytes: Map<string, Uint8Array> } | null {
  const base = { id: newId(), name, source, created: new Date().toISOString(), min: g.MinValue, max: g.MaxValue, animationSpeed: g.AnimationSpeed };
  const vector = vectorOf(g);
  if (vector) return { entry: { ...base, kind: "vector", vector }, bytes: new Map() };
  const f = framesForLibrary(g, assets);
  return f ? { entry: { ...base, kind: "frames", frames: f.frames }, bytes: f.bytes } : null;
}

async function entryFiles(e: LibraryEntry): Promise<AssetFile[]> {
  const cache = new Map<string, Uint8Array>();
  const out: AssetFile[] = [];
  for (const f of e.frames ?? []) {
    if (!cache.has(f.hash)) cache.set(f.hash, await fetchFrame(f.hash));
    out.push(await assetFile(f.name, cache.get(f.hash)!, "added"));
  }
  return out;
}

function LibraryThumb({ e }: { e: LibraryEntry }) {
  if (e.vector) return <VectorGaugeSvg gauge={e.vector} p={0.66} width={64} height={48} id={`lib-${e.id}`} style={{ objectFit: "contain" }} />;
  const mid = e.frames?.[Math.round(((e.frames?.length ?? 1) - 1) * 0.66)];
  return mid ? <img src={`/gauges/frames/${mid.hash}`} alt="" style={{ width: 64, height: 48, objectFit: "contain", display: "block" }} /> : null;
}

export function GaugePanel({ editor, profileName }: { editor: Editor; profileName: string }) {
  const urlOf = useObjectUrls();
  const [note, setNote] = useState<string | null>(null);
  const [p, setP] = useState(0.66);
  const [playing, setPlaying] = useState(false);
  const [filter, setFilter] = useState<string | undefined>();
  const [starter, setStarter] = useState(0);
  const [bakeCount, setBakeCount] = useState(101);
  const [library, setLibrary] = useState<LibraryEntry[] | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const doc: Doc = { items: editor.present, assets: editor.assets };
  const paths = gaugePaths(editor.present);
  const single = editor.selection.length === 1 ? editor.selection[0] : null;
  const selected = single && isGauge(itemAt(editor.present, single)) ? single : null;
  const g = selected ? (itemAt(editor.present, selected) as GaugeItem) : null;
  const vector = g ? vectorOf(g) : null;
  // The drawn spec: a field being typed previews before it commits.
  const shownVector = g && selected ? vectorOf(itemAt(editor.items, selected)) : null;

  const reload = () => fetchLibrary().then(
    (l) => (setLibrary(l), setLibraryError(null)),
    (e: Error) => setLibraryError(e.message),
  );
  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (!playing) return;
    let frame = requestAnimationFrame(function tick(now) {
      // Up and down over four seconds.
      const t = (now / 4000) % 1;
      setP(t < 0.5 ? t * 2 : 2 - t * 2);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const run = (what: string, work: () => Promise<string | void>) => {
    setNote(`${what}…`);
    work().then(
      (message) => setNote(message || null),
      (e: Error) => setNote(`${what} failed: ${e.message}`),
    );
  };

  const known = new Set((library ?? []).map(entrySignature));
  const save = (paths: Path[]) =>
    run("Saving to the library", async () => {
      let saved = 0;
      const skipped: string[] = [];
      for (const path of paths) {
        const gauge = itemAt(editor.present, path) as GaugeItem;
        const made = entryFor(gauge, editor.assets, gauge.Name || `Gauge ${path}`, profileName);
        if (!made) skipped.push(`${gauge.Name} (frames outside the export)`);
        else if (known.has(entrySignature(made.entry))) skipped.push(`${gauge.Name} (already in the library)`);
        else {
          await saveEntry(made.entry, made.bytes);
          known.add(entrySignature(made.entry));
          saved++;
        }
      }
      await reload();
      return `${saved} saved${skipped.length ? `; skipped: ${skipped.join(", ")}` : ""}`;
    });

  const applyEntry = (e: LibraryEntry, mode: "selected" | "new") =>
    run("Using the library gauge", async () => {
      if (mode === "selected" && selected) {
        if (e.vector) editor.apply(setVector(editor.present, selected, e.vector));
        else editor.applyDoc(setFrameFiles(doc, selected, await entryFiles(e)));
        return;
      }
      const fields = { MinValue: e.min, MaxValue: e.max, AnimationSpeed: e.animationSpeed };
      if (e.vector) {
        const r = insertVectorGauge(editor.present, e.vector, e.name);
        const items = Object.entries(fields).reduce((t, [k, v]) => setField(t, r.path, k, v), r.items);
        editor.apply(items, [r.path]);
      } else {
        const r = insertFramesGauge(doc, await entryFiles(e), e.name, fields);
        editor.applyDoc(r.doc);
        editor.select([r.path]);
      }
    });

  return (
    <section>
      <h3>Gauges ({paths.length})</h3>
      <p>
        New vector gauge:{" "}
        <select value={starter} onChange={(e) => setStarter(Number(e.target.value))}>
          {STARTERS.map((s, i) => (
            <option key={s.name} value={i}>
              {s.name}
            </option>
          ))}
        </select>{" "}
        <button
          onClick={() => {
            const r = insertVectorGauge(editor.present, STARTERS[starter].gauge, STARTERS[starter].name);
            editor.apply(r.items, [r.path]);
          }}
        >
          Add
        </button>
        {paths.length > 0 && (
          <>
            {" "}
            · <button onClick={() => save(paths)}>Save all to the library</button>
          </>
        )}{" "}
        {note && <em>{note}</em>}
      </p>
      {paths.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Name</th>
              <th>Kind</th>
              <th>Frames</th>
              <th>Range</th>
              <th>AnimationSpeed</th>
            </tr>
          </thead>
          <tbody>
            {paths.map((path) => {
              const gauge = itemAt(editor.present, path) as GaugeItem;
              const first = filesOf(gauge, editor.assets)[0];
              return (
                <tr key={path} style={{ background: path === selected ? "#523" : undefined }}>
                  <td>
                    <button onClick={() => editor.select([path])}>{path}</button>
                  </td>
                  <td>{gauge.Name}</td>
                  <td>
                    {vectorOf(gauge) ? "vector, live" : "frames"}
                    {isStale(gauge) && <span style={{ color: "#999" }}> ({gauge.Images.length ? "InfoPanel frames out of date" : "no InfoPanel frames"})</span>}
                  </td>
                  <td>
                    {gauge.Images.length}
                    {first?.width ? ` × ${first.width}×${first.height}` : ""}
                  </td>
                  <td>
                    {gauge.MinValue} – {gauge.MaxValue}
                  </td>
                  <td>{gauge.AnimationSpeed || "instant"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {g && selected && (
        <div style={{ border: "1px solid #444", padding: 8, margin: "8px 0" }}>
          <h4 style={{ marginTop: 0 }}>
            {selected} {g.Name}
          </h4>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              {shownVector ? (
                <div style={{ width: 160, height: 160, display: "grid", placeItems: "center", background: "repeating-conic-gradient(#2a2a2a 0 25%, #1c1c1c 0 50%) 0 0 / 16px 16px" }}>
                  <VectorGaugeSvg
                    gauge={shownVector}
                    p={p}
                    id="gauge-preview"
                    {...(shownVector.width >= shownVector.height
                      ? { width: 160, height: (160 * shownVector.height) / shownVector.width }
                      : { height: 160, width: (160 * shownVector.width) / shownVector.height })}
                  />
                </div>
              ) : (
                <FramesPreview frames={filesOf(g, editor.assets)} p={p} speed={g.AnimationSpeed} size={160} filter={filter} urlOf={urlOf} />
              )}
              <div>
                <input type="range" min={0} max={1} step={0.005} value={p} onChange={(e) => (setPlaying(false), setP(Number(e.target.value)))} />{" "}
                {Math.round(g.MinValue + p * (g.MaxValue - g.MinValue))}
              </div>
              <label>
                <input type="checkbox" checked={playing} onChange={() => setPlaying(!playing)} /> play
              </label>
            </div>
            <div style={{ flex: 1, minWidth: 360 }}>
              <p>
                Retime: AnimationSpeed{" "}
                <input
                  type="number"
                  min={0}
                  max={200}
                  step={1}
                  value={g.AnimationSpeed}
                  style={{ width: 64 }}
                  onChange={(e) => editor.set(selected, "AnimationSpeed", Math.max(0, Number(e.target.value) || 0))}
                />{" "}
                {vector ? "% of the range a second (0: jumps at once)" : "frames/s (0: jumps at once; InfoPanel crossfades between frames while it moves)"}
              </p>
              {vector ? (
                <>
                  <VectorForm
                    gauge={vector}
                    onPreview={(next) => editor.preview(next ? setVector(editor.present, selected, next) : null)}
                    onCommit={(next) => editor.apply(setVector(editor.present, selected, next))}
                  />
                  <p>
                    The studio draws this gauge live. For InfoPanel (optional), bake it into{" "}
                    <input type="number" min={2} max={1000} value={bakeCount} style={{ width: 64 }} onChange={(e) => setBakeCount(Math.max(2, Math.min(1000, Number(e.target.value) || 2)))} />{" "}
                    PNG frames{" "}
                    <button
                      onClick={() =>
                        run("Baking", async () => {
                          const files = await bake(vector, bakeCount, safeStem(g.Name), (done) => setNote(`Baking… ${done}/${bakeCount}`));
                          editor.applyDoc(setFrameFiles(doc, selected, files, bakeSignature(vector, bakeCount)));
                        })
                      }
                    >
                      Bake
                    </button>{" "}
                    {!isStale(g) ? "frames are up to date" : g.Images.length ? "the frames are out of date" : "no frames yet"} ·{" "}
                    <button onClick={() => editor.apply(setVector(editor.present, selected, null))} title="Keeps the frames">
                      Back to frames only
                    </button>
                  </p>
                </>
              ) : (
                <p>
                  <button
                    onClick={() => editor.apply(setVector(editor.present, selected, { ...STARTERS[starter].gauge }))}
                    title="Draws the gauge from a vector spec (the starter chosen above); the frames stay until baked"
                  >
                    Convert to vector ({STARTERS[starter].name})
                  </button>
                </p>
              )}
              {g.Images.length > 0 && (
                <>
                  {!vector && <RecolourTool key={selected} g={g} path={selected} editor={editor} doc={doc} onFilter={setFilter} run={run} />}
                  <FrameStrip key={`${selected}:${g.Images.length}`} g={g} path={selected} editor={editor} doc={doc} urlOf={urlOf} run={run} />
                </>
              )}
              <p>
                <button onClick={() => save([selected])}>Save to the library</button>
              </p>
            </div>
          </div>
        </div>
      )}

      <h4>Library {library ? `(${library.length})` : ""}</h4>
      {libraryError && <p>Library unavailable: {libraryError}</p>}
      {library && library.length === 0 && <p>Empty: save gauges from a profile, or make vector gauges.</p>}
      {library && library.length > 0 && (
        <table>
          <tbody>
            {library.map((e) => (
              <tr key={e.id}>
                <td>
                  <LibraryThumb e={e} />
                </td>
                <td>
                  {e.name}
                  <div style={{ fontSize: 12, color: "#999" }}>
                    {e.kind === "vector" ? "vector" : `${e.frames?.length} frames`} · {e.min}–{e.max}
                    {e.source && ` · from ${e.source}`}
                  </div>
                </td>
                <td>
                  <button disabled={!selected} title={selected ? "The selected gauge draws this one; its sensor and range stay" : "Select a gauge first"} onClick={() => applyEntry(e, "selected")}>
                    Use for the selected gauge
                  </button>{" "}
                  <button onClick={() => applyEntry(e, "new")}>Insert as a new gauge</button>{" "}
                  <button onClick={() => run("Deleting", async () => (await deleteEntry(e.id), await reload()))}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
