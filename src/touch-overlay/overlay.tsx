// The touch setup overlays (app/touch.html, src-tauri/src/touch/screens.rs): what a touch display shows while Settings ›
// Touch sets it up. Studio reads the touches itself; this page only draws, and hears progress as `touch-overlay` events
// sent to its own window.

import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

/** Calibration targets at 10 % insets, clockwise from top-left (screens.rs `TARGETS`). */
export const TARGETS: [number, number][] = [
  [0.1, 0.1],
  [0.9, 0.1],
  [0.9, 0.9],
  [0.1, 0.9],
];

export type Route =
  | { kind: "setup"; radius: number }
  | { kind: "pair"; name: string }
  | { kind: "calibrate"; name: string }
  | { kind: "identify"; name: string }
  | { kind: "none" };

/** The overlay a hash asks for: `#setup/<radius>`, `#pair/<name>`, `#calibrate/<name>` or `#identify/<name>`. */
export function parseRoute(hash: string): Route {
  const [kind, ...rest] = hash.replace(/^#/, "").split("/");
  const arg = rest.join("/");
  let name = arg;
  try {
    name = decodeURIComponent(arg);
  } catch {
    // A malformed escape: the raw text is still a fine label.
  }
  switch (kind) {
    case "setup": {
      const radius = Number(arg);
      return Number.isFinite(radius) && radius >= 0 && radius <= 0.5 ? { kind, radius } : { kind: "none" };
    }
    case "pair":
    case "calibrate":
    case "identify":
      return { kind, name };
    default:
      return { kind: "none" };
  }
}

interface Progress {
  bound?: string;
  target?: number;
  done?: boolean;
}

/** The progress Studio sends this window. */
function useProgress(): Progress {
  const [progress, setProgress] = useState<Progress>({});
  useEffect(() => {
    const off = getCurrentWebviewWindow().listen<Progress>("touch-overlay", (e) => setProgress((p) => ({ ...p, ...e.payload })));
    return () => {
      void off.then((f) => f()).catch(() => {});
    };
  }, []);
  return progress;
}

function Heading({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="absolute inset-x-0 top-8 flex flex-col items-center gap-2 px-6 text-center">
      <div className="text-4xl font-semibold text-zinc-100">{title}</div>
      <div className="font-mono text-[15px] text-zinc-400">{detail}</div>
    </div>
  );
}

/** A tap target centred at (`left`, `top`) in percent. */
function Target({ left, top, done }: { left: number; top: number; done?: boolean }) {
  return (
    <div className="absolute -m-[60px] size-[120px]" style={{ left: `${left}%`, top: `${top}%` }}>
      {!done && <div className="absolute inset-0 rounded-full border-[3px] border-sky-400 [animation:touch-ripple_1.6s_ease-out_infinite]" />}
      <div className={done ? "absolute inset-9 rounded-full bg-zinc-600" : "absolute inset-9 rounded-full bg-sky-400"} />
    </div>
  );
}

export function Overlay() {
  const [route] = useState(() => parseRoute(window.location.hash));
  const progress = useProgress();
  return (
    <div className="relative h-full overflow-hidden bg-[#0c0c0e] font-sans">
      {route.kind === "setup" && (
        <>
          <Target left={(0.5 + route.radius) * 100} top={50} done={progress.bound !== undefined} />
          <Heading
            title={progress.bound ? "Set up" : "Tap the circle"}
            detail={progress.bound ? "This screen's touch is ready." : "on each screen whose touch you want to use"}
          />
        </>
      )}
      {route.kind === "pair" && (
        <div className="grid h-full place-items-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="text-5xl font-semibold text-zinc-100">Touch this screen</div>
            <div className="font-mono text-base text-zinc-400">to pair {route.name}</div>
          </div>
        </div>
      )}
      {route.kind === "identify" && (
        <div className="grid h-full place-items-center">
          <div className="text-7xl font-semibold text-zinc-100">{route.name}</div>
        </div>
      )}
      {route.kind === "calibrate" && <Calibrate name={route.name} progress={progress} />}
    </div>
  );
}

function Calibrate({ name, progress }: { name: string; progress: Progress }) {
  const next = progress.target ?? 0;
  if (progress.done !== undefined) {
    return <Heading title={progress.done ? "Calibrated" : "Not saved"} detail={progress.done ? `${name} is calibrated.` : "See InfoPanel Studio's settings."} />;
  }
  const [fx, fy] = TARGETS[Math.min(next, TARGETS.length - 1)];
  return (
    <>
      <Target left={fx * 100} top={fy * 100} />
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="text-3xl font-semibold text-zinc-100">Tap the centre of each circle</div>
          <div className="font-mono text-[15px] text-zinc-400">
            {name} · {Math.min(next + 1, TARGETS.length)} of {TARGETS.length}
          </div>
        </div>
      </div>
    </>
  );
}
