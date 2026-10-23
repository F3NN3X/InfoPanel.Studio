import { useEffect, useMemo, type CSSProperties } from "react";
import { MAX_FRAME_GAP_MS, subscribeFrame } from "@/lib/audio/frame-loop";
import { SKINS, SkinCtx } from "../theme";
import type { SkinContext } from "../types";
import { AudioViz } from "./AudioViz";
import { bandCentreHz } from "./dynamics";
import { BAND_COUNT, createInputState, stepInput } from "./input";
import { DEFAULT_LOOK, VIZ_STYLES, type VizLook } from "./types";

/**
 * Dev-only QA page for the visualiser (`?viz-gallery`): every style under Follow in four skins and
 * three Custom looks, at 110 and 150 px cells. The input is a deterministic TEST SIGNAL (a fixed
 * pink-ish spectrum stepping through four frames), never production data.
 */

const SKIN_ROWS = ["default", "synth", "retro", "ios"];
const CUSTOM_ROWS: { name: string; look: Partial<VizLook> }[] = [
  { name: "custom · solid, segments, peaks", look: { colorMode: "solid", color1: "#38bdf8", shape: "segments", peaks: true } },
  { name: "custom · gradient, pill, glow", look: { colorMode: "gradient", gradient: "horizontal", color1: "#f43f5e", color2: "#f59e0b", color3: "#22c55e", shape: "pill", glow: "on" } },
  { name: "custom · thermal ramp, square, 80%", look: { colorMode: "ramp", color1: "thermal", shape: "square", opacity: 0.8 } },
];
const CELLS = [110, 150];
const FRAME_MS = 700;

/** The test signal's frame `k` (0..3) on the plugin's 0..1 scale: -3 dB/oct from -30 dB, with a fixed ripple per frame. */
export function testFrame(k: number, n = BAND_COUNT): Float32Array {
  return Float32Array.from({ length: n }, (_, i) => {
    const db = -30 - 3 * Math.log2(bandCentreHz(i, n) / 30) + 6 * Math.cos(2 * Math.PI * ((2 * i) / n + k / 4));
    return Math.max(0, Math.min(1, (db + 80) / 80));
  });
}

function useTestSignal() {
  const st = useMemo(() => createInputState(), []);
  const frames = useMemo(() => [0, 1, 2, 3].map((k) => testFrame(k)), []);
  useEffect(() => {
    let last = 0;
    return subscribeFrame((now) => {
      const dt = last ? Math.min(MAX_FRAME_GAP_MS, now - last) : 16;
      last = now;
      const k = Math.floor(now / FRAME_MS) % 4;
      stepInput(st, { capture: null, spectrum: frames[k], level: null }, DEFAULT_LOOK, dt, now);
    }, "update", "viz:gallery");
  }, [st, frames]);
  return useMemo(() => () => st.input, [st]);
}

function skinCtx(skin: string): SkinContext {
  const s = SKINS[skin] ?? {};
  return { ...s, skin, graph: s.graph ?? "area", meter: s.meter ?? "bar", stroke: 1 };
}

export default function VizGallery() {
  const input = useTestSignal();
  const rows = [...SKIN_ROWS.map((skin) => ({ name: `follow · ${skin}`, skin, look: {} })), ...CUSTOM_ROWS.map((r) => ({ ...r, skin: "default" }))];
  return (
    <main className="min-h-screen bg-[#0c0c0e] p-6 text-zinc-100">
      <h1 className="mb-1 text-sm font-semibold">Visualizer gallery</h1>
      <p className="mb-4 font-mono text-xs text-amber-300">TEST SIGNAL: a fixed pink-ish spectrum stepping through 4 frames (dev QA input, not audio)</p>
      {CELLS.map((cell) => (
        <section key={cell} className="mb-8">
          <h2 className="mb-2 font-mono text-xs opacity-60">cell {cell}</h2>
          {rows.map((row) => (
            <SkinCtx.Provider key={row.name} value={skinCtx(row.skin)}>
              <div className="mb-3 flex items-start gap-3" style={{ "--accent": SKINS[row.skin]?.accent ?? "#34d399", "--w-track": "rgba(255,255,255,.07)", "--w-fg": "#f4f4f5" } as CSSProperties}>
                <span className="w-40 shrink-0 font-mono text-[10px] opacity-70">{row.name}</span>
                {VIZ_STYLES.map((style) => (
                  <figure key={style} data-viz-tile={`${row.name}|${style}|${cell}`} className="m-0 flex flex-col gap-1">
                    <div className="relative rounded-lg bg-[#161a20] p-2" style={{ width: cell * 2 + 8, height: cell }}>
                      <AudioViz style={style} look={row.look} input={input} className="h-full" aria-label={`${style} test signal`} />
                    </div>
                    <figcaption className="font-mono text-[10px] opacity-60">{style}</figcaption>
                  </figure>
                ))}
              </div>
            </SkinCtx.Provider>
          ))}
        </section>
      ))}
    </main>
  );
}
