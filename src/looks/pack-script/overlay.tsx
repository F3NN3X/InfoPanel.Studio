// The overlay a pack script draws on (lazy: the entries load this chunk only for a pack whose pack.json names a script, mount.tsx).
// One canvas per page, above the cards and click-through, hidden from assistive tech. It asks the server first (trust.ts): the
// script is fetched only when the server says it runs, and runs only while `planScript` allows it. A change of plan (hidden, Effects
// level, lite mode, reduced motion) takes the canvas away, which terminates the worker; a new plan mounts a new canvas. A script
// that ended (fallback or stopped) stays ended on this page. The studio asks about an unverified pack's script here; the kiosk never does.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePerformance } from "@/hooks/use-performance";
import { liteOf } from "@/lib/performance";
import { cssColour } from "../colour";
import { resolveT1, type T1Name } from "../look";
import type { Pack } from "../pack";
import { ScriptConsent } from "./consent";
import { planScript, sandboxSupported, type ScriptPlan } from "./gate";
import { seedOf, startScript } from "./host";
import type { ScriptEnd } from "./limits";
import { asksConsent, giveConsent, type PackTrust, readScript, readTrust } from "./trust";

/** The palette a script paints with, by index: the Look's own colours in its first mode. */
export const PALETTE: readonly T1Name[] = ["accent", "fg", "muted", "ok", "warn", "crit", "info", "bg", "surface", "fg-2"];

export function paletteOf(pack: Pack): string[] {
  try {
    const t1 = resolveT1(pack.look, pack.look.modes.supported[0]);
    return PALETTE.map((n) => cssColour(t1[n]));
  } catch {
    return [];
  }
}

const watchHidden = (fn: () => void) => {
  document.addEventListener("visibilitychange", fn);
  return () => document.removeEventListener("visibilitychange", fn);
};
const isHidden = () => document.hidden;

export interface PackScriptOverlayProps {
  pack: Pack;
  /** The studio's canvas: asks about an unverified pack's script. */
  studio?: boolean;
  /** Places the canvas (`fixed inset-0 z-10` in the kiosk, `absolute inset-0 z-10` in the studio). */
  className?: string;
}

/** What `data-pack-script` says: waiting (for the server or the plan), running, or how it ended. */
type Status = "waiting" | "running" | ScriptEnd;

export default function PackScriptOverlay({ pack, studio, className = "" }: PackScriptOverlayProps) {
  const perf = usePerformance();
  const hidden = useSyncExternalStore(watchHidden, isHidden, () => false);
  const [trust, setTrust] = useState<{ id: string; trust?: PackTrust }>();
  const [source, setSource] = useState<{ id: string; text?: string }>();
  const [ended, setEnded] = useState<{ id: string; end: ScriptEnd }>();
  const [asked, setAsked] = useState(0);
  const [dismissed, setDismissed] = useState<string>();
  const id = pack.id;

  useEffect(() => {
    let live = true;
    void readTrust(id).then((t) => live && setTrust({ id, trust: t }));
    return () => {
      live = false;
    };
  }, [id, asked]);
  const now = trust?.id === id ? trust.trust : undefined;
  const runs = !!now?.scriptRuns;
  useEffect(() => {
    if (!runs) return;
    let live = true;
    void readScript(id).then((text) => live && setSource({ id, text }));
    return () => {
      live = false;
    };
  }, [id, runs]);
  const text = runs && source?.id === id ? source.text : undefined;
  const plan = planScript({ level: perf.fx, lite: liteOf(perf), reduceMotion: perf.reduceMotion, hidden, runs: runs && !!text, supported: sandboxSupported() });
  const over = ended?.id === id ? ended.end : undefined;
  const onEnd = useCallback((end: ScriptEnd) => setEnded({ id, end }), [id]);
  const answer = async (granted: boolean) => {
    setDismissed(id);
    await giveConsent(id, granted);
    setAsked((n) => n + 1);
  };
  const status: Status = over ?? (plan && text ? "running" : "waiting");

  return (
    <>
      {studio && asksConsent(now) && dismissed !== id && <ScriptConsent open name={pack.look.name || id} publisher={now?.publisher} onAnswer={(g) => void answer(g)} onDismiss={() => setDismissed(id)} />}
      <div hidden data-pack-script={status} data-look={id} />
      {plan && text && !over && <ScriptCanvas key={`${id}:${plan.level}`} pack={pack} source={text} plan={plan} className={className} onEnd={onEnd} />}
    </>
  );
}

function ScriptCanvas({ pack, source, plan, className, onEnd }: { pack: Pack; source: string; plan: ScriptPlan; className: string; onEnd: (end: ScriptEnd) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // the plan is in the key: this canvas runs one plan, handed to one worker, and a new plan is a new canvas
  useEffect(() => {
    const canvas = ref.current;
    const root = canvas?.parentElement;
    if (!canvas || !root) return;
    return startScript({ canvas, root, source, seed: seedOf(pack.id), plan, palette: paletteOf(pack), onEnd });
  }, []);
  return <canvas ref={ref} aria-hidden data-pack-script-canvas="" data-look={pack.id} className={`pointer-events-none ${className}`} style={{ width: "100%", height: "100%" }} />;
}
