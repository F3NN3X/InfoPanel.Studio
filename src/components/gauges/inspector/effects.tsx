/** Effects (glow, shadow) and the liquid parts (wave, shine, bubbles). */
import { GLOW, SHADOW, SHINE } from "@/lib/gauge-studio/parts";
import { BUBBLES, DEFAULT_LIQUID } from "@/lib/infopanel/gauges/shapes";
import type { Liquid, Shadow } from "@/lib/infopanel/gauges/vector";
import { NumRow, PaintRow, type InspectorProps } from "./rows";

export function GlowInspector({ g, set }: InspectorProps) {
  return <NumRow label="Strength" value={g.glow ?? GLOW} min={1} max={64} unit="px" onChange={(glow) => set({ ...g, glow }, "glow")} />;
}

export function ShadowInspector({ g, set }: InspectorProps) {
  const s = g.shadow ?? SHADOW;
  const patch = (p: Partial<Shadow>, key?: string) => set({ ...g, shadow: { ...s, ...p } }, key);
  return (
    <div className="space-y-1">
      <NumRow label="Blur" value={s.blur} min={0} max={64} unit="px" onChange={(blur) => patch({ blur }, "blur")} />
      <NumRow label="Offset x" value={s.dx} min={-64} max={64} unit="px" onChange={(dx) => patch({ dx }, "dx")} />
      <NumRow label="Offset y" value={s.dy} min={-64} max={64} unit="px" onChange={(dy) => patch({ dy }, "dy")} />
      <PaintRow label="Color" value={s.color} onChange={(color) => patch({ color }, "color")} />
      <NumRow label="Opacity" value={s.opacity} min={0} max={1} step={0.05} onChange={(opacity) => patch({ opacity }, "opacity")} />
    </div>
  );
}

function liquidOf({ g, set }: InspectorProps) {
  const liquid = g.liquid ?? DEFAULT_LIQUID;
  return { liquid, patch: (p: Partial<Liquid>, key?: string) => set({ ...g, liquid: { ...liquid, ...p } }, key) };
}

export function WaveInspector(p: InspectorProps) {
  const { liquid, patch } = liquidOf(p);
  return (
    <div className="space-y-1">
      <NumRow label="Height" value={Math.max(1, liquid.amplitude)} min={1} max={64} unit="px" onChange={(amplitude) => patch({ amplitude }, "amplitude")} />
      <NumRow label="Waves across" value={liquid.waves} min={0.5} max={8} step={0.5} onChange={(waves) => patch({ waves }, "waves")} />
      <NumRow label="One wave every" value={liquid.speed} min={0} max={30} step={0.5} unit="s" onChange={(speed) => patch({ speed }, "speed")} />
      <p className="text-[11.5px] leading-snug text-ui-4">0 s keeps it still. Baked frames are still.</p>
    </div>
  );
}

export function ShineInspector(p: InspectorProps) {
  const { liquid, patch } = liquidOf(p);
  return <NumRow label="Opacity" value={liquid.shine ?? SHINE} min={0} max={1} step={0.05} onChange={(shine) => patch({ shine }, "shine")} />;
}

export function BubblesInspector(p: InspectorProps) {
  const { liquid, patch } = liquidOf(p);
  const b = liquid.bubbles ?? BUBBLES;
  const edit = (x: Partial<typeof b>, key: string) => patch({ bubbles: { ...b, ...x } }, key);
  return (
    <div className="space-y-1">
      <NumRow label="Count" value={b.count} min={1} max={40} onChange={(count) => edit({ count }, "count")} />
      <NumRow label="Size" value={b.size} min={1} max={64} unit="px" onChange={(size) => edit({ size }, "size")} />
      <NumRow label="Rise in" value={b.speed} min={0} max={30} step={0.5} unit="s" onChange={(speed) => edit({ speed }, "speed")} />
    </div>
  );
}
