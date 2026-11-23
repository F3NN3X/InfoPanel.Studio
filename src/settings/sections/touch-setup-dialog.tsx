import { useEffect, useId, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import type { ControlDisplay } from "@/lib/control";
import { isDisplayName } from "@/lib/screens/display-name";
import { statusText } from "@/lib/touch/kiosk";
import { displayOfPanel, panelKioskUrl, panelOfDisplay } from "@/lib/touch/panels";
import { firstUnfinished, SETUP_STEP_TITLE, SETUP_STEPS, stepDone, type SetupFacts, type SetupStep } from "@/lib/touch/setup-steps";
import type { TouchMsg } from "@/lib/touch/types";
import { cn } from "@/lib/utils";
import { errorText, ipc } from "../ipc";
import type { Touchscreen, TouchPanelEntry, TouchView } from "../types";
import { Button, Segmented } from "../ui";
import { Field, ROTATIONS, ZadigSteps, type SetKey } from "./touch-parts";
import { ShowSteps } from "./touch-panel-card";

/** Touchscreens are listed this often while the setup is open, so one turns ready the moment Zadig is done. */
const SCREENS_POLL_MS = 2000;

/** Who the setup is for: a panel by id, or a display that has none yet (the new panel takes its name). */
export interface SetupTarget {
  panel?: string;
  display?: string;
}

interface SetupDialogProps {
  view: TouchView | null;
  target: SetupTarget;
  displays: readonly ControlDisplay[];
  port: number;
  setKey: SetKey;
  /** Turn touch panels on (the app setting). */
  enable: () => Promise<void>;
  /** The panels whose size was confirmed: kept by the page, so a closed setup resumes past it. */
  sizeConfirmed: ReadonlySet<string>;
  onSizeConfirmed: (panel: string) => void;
  /** Pairing found the panel: the setup goes on for it. */
  onTarget: (target: SetupTarget) => void;
  onClose: () => void;
}

/** The panel the setup is for, by its target. */
function targetPanel(panels: readonly TouchPanelEntry[], target: SetupTarget): TouchPanelEntry | undefined {
  if (target.panel) return panels.find((p) => p.id === target.panel);
  return panelOfDisplay(panels, target.display);
}

/**
 * The guided setup (Settings › Touch, opened from a display card on Screens or "Set up a panel…"): touch on, the
 * touchscreen's driver, pairing by a touch on its screen, its size and rotation, its kiosk in InfoPanel, and a test tap.
 * It runs the same commands as the rest of the page and reads every step's state from the app, so it can be closed
 * and opened again at the first step not done. Problems are said in the kiosk's own words (`statusText`).
 */
export default function TouchSetupDialog({ view, target, displays, port, setKey, enable, sizeConfirmed, onSizeConfirmed, onTarget, onClose }: SetupDialogProps) {
  const [screens, setScreens] = useState<Touchscreen[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tap, setTap] = useState<{ x: number; y: number } | null>(null);
  /** The port pairing bound, until the view shows the panel that has it. */
  const [bound, setBound] = useState<{ port: string; before: ReadonlySet<string> } | null>(null);

  useEffect(() => {
    const tick = () => void ipc.touchScreens().then(setScreens, (e) => setError(`Could not list USB devices: ${errorText(e)}`));
    tick();
    const timer = window.setInterval(tick, SCREENS_POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const panels = view?.effective.panels ?? [];
  const index = (() => {
    const p = targetPanel(panels, target);
    return p ? panels.indexOf(p) : -1;
  })();
  const panel = index >= 0 ? panels[index] : undefined;
  const status = panel ? view?.panels.find((p) => !p.is_virtual && p.id === panel.id)?.status : undefined;
  const display = panel ? displayOfPanel(displays, panel) : undefined;
  // The touchscreens this panel can have: its own, and any no other panel is pinned to.
  const free = screens?.filter((s) => s.port === panel?.device.port || !panels.some((p) => p !== panel && p.device.port === s.port)) ?? null;

  // Pairing bound a port: go on with the panel that has it now. A panel new to this setup, started from a display
  // with no panel, takes the display's name as its id, so its kiosk is that display.
  useEffect(() => {
    if (!bound) return;
    const i = panels.findIndex((p) => p.device.port === bound.port);
    if (i < 0) return;
    setBound(null);
    const found = panels[i];
    const name = target.display;
    if (name && isDisplayName(name) && !bound.before.has(found.id) && found.id !== name && !panels.some((p) => p.id === name)) {
      void setKey(`panels.${i}.id`, name).then((ok) => onTarget({ panel: ok ? name : found.id }));
    } else onTarget({ panel: found.id });
  }, [bound, panels]);

  const facts: SetupFacts = {
    enabled: view?.enabled ?? false,
    screens: free,
    paired: !!panel?.device.port,
    sizeConfirmed: panel ? sizeConfirmed.has(panel.id) : false,
    kioskOnline: display?.online === true,
    tapped: tap !== null,
  };
  const step = firstUnfinished(facts);

  // The test tap: this panel's touch stream, read here as the kiosk reads it.
  useEffect(() => {
    if (step !== "test" || !panel || typeof EventSource === "undefined") return;
    const source = new EventSource(`/events/touch?panel=${encodeURIComponent(panel.id)}`);
    source.onmessage = (e: MessageEvent<string>) => {
      try {
        const m = JSON.parse(e.data) as TouchMsg;
        if ("type" in m && m.type === "Gesture" && m.gesture.type === "Tap") setTap({ x: Math.round(m.x), y: Math.round(m.y) });
      } catch {
        // Not a message this step reads.
      }
    };
    return () => source.close();
  }, [step, panel?.id]);

  const run = async (what: string, action: () => Promise<unknown>) => {
    setBusy(what);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(Array.isArray(e) ? `Not saved: ${e.join("; ")}` : errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const pair = () =>
    run("pair", async () => {
      // A panel that knows its display is asked for by name there; any other is found by a touch on every screen.
      if (panel?.monitor) {
        await ipc.touchPair(index);
        return;
      }
      const before = new Set(panels.filter((p) => p.device.port).map((p) => p.id));
      const result = await ipc.touchSetup();
      if (result.length === 0) throw new Error("Nothing was paired: no tap reached a circle. Try again, and touch the circle on the panel's screen.");
      setBound({ port: result[0].port, before });
    });

  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal?.();
  }, []);

  const title = panel ? `Set up ${panel.name}` : target.display ? `Set up touch on ${target.display}` : "Set up a touch panel";
  const deviceTrouble = status && status.status !== "Connected" ? statusText(status, panel?.name ?? "The panel") : null;

  return (
    // A native modal dialog: the page behind is inert and Esc closes it (not while a step waits for a touch). Not Base
    // UI's, whose dialog would move into a chunk of its own that the studio's entry then loads too.
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (busy === null) onClose();
      }}
      className="s-scope m-auto flex max-h-[90vh] w-140 max-w-[94vw] flex-col overflow-hidden rounded-14 border border-s-card-line bg-s-card p-0 text-s-t1 shadow-2xl outline-none backdrop:bg-black/50"
    >
          <div className="flex items-center gap-3 border-b border-s-divider px-4.5 py-3.5">
            <h2 id={titleId} className="m-0 flex-1 text-lead font-medium">
              {title}
            </h2>
            <button type="button" aria-label="Close" disabled={busy !== null} onClick={onClose} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-s-muted hover:bg-s-nav-hover hover:text-s-t1 disabled:opacity-50">
              <X className="h-4 w-4" />
            </button>
          </div>
          <ol className="m-0 flex list-none flex-col overflow-y-auto p-0">
            {SETUP_STEPS.map((s, i) => {
              const done = stepDone(s, facts);
              const open = s === step;
              return (
                <li key={s} aria-current={open ? "step" : undefined} className={cn("flex flex-col gap-2.5 border-b border-s-divider px-4.5 py-3", !open && "text-s-muted")}>
                  <span className="flex items-center gap-2.5 text-body font-medium">
                    <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full text-micro", done ? "bg-s-green/14 text-s-green" : open ? "bg-s-strong text-s-on-accent" : "bg-s-hover text-s-dim")}>
                      {done ? <Check className="h-3 w-3" aria-label="Done" /> : i + 1}
                    </span>
                    {SETUP_STEP_TITLE[s]}
                  </span>
                  {open && (
                    <div className="flex flex-col gap-2.5 pl-7.5 text-caption leading-[1.5] text-s-t2">
                      <StepBody
                        step={s}
                        busy={busy}
                        screens={free}
                        panel={panel}
                        port={port}
                        deviceTrouble={deviceTrouble}
                        tap={tap}
                        onEnable={() => void run("enable", enable)}
                        onPair={() => void pair()}
                        onCancel={() => void ipc.touchCancel()}
                        onSize={(w, h, rotation) =>
                          void run("size", async () => {
                            if (!panel) return;
                            const base = `panels.${index}.panel`;
                            if (w !== panel.panel.width_px && !(await setKey(`${base}.width_px`, w))) return;
                            if (h !== panel.panel.height_px && !(await setKey(`${base}.height_px`, h))) return;
                            if (rotation !== panel.panel.rotation && !(await setKey(`${base}.rotation`, rotation))) return;
                            onSizeConfirmed(panel.id);
                          })
                        }
                        onIdentify={() => void run("identify", () => ipc.touchIdentify(index))}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="flex flex-col gap-2 px-4.5 py-3.5">
            {error && (
              <span role="alert" className="text-caption text-s-red">
                {error}
              </span>
            )}
            {step === null ? (
              <div className="flex items-center gap-3">
                <span className="flex-1 text-caption text-s-green">Done. Its card on Screens says Ready, and Shows picks its screen.</span>
                <Button kind="accent" onClick={onClose}>
                  Close
                </Button>
              </div>
            ) : (
              <span className="text-caption text-s-muted">You can close this at any time: it opens again at the first step not done.</span>
            )}
          </div>
    </dialog>
  );
}

interface StepBodyProps {
  step: SetupStep;
  busy: string | null;
  screens: readonly Touchscreen[] | null;
  panel: TouchPanelEntry | undefined;
  port: number;
  deviceTrouble: string | null;
  tap: { x: number; y: number } | null;
  onEnable: () => void;
  onPair: () => void;
  onCancel: () => void;
  onSize: (width: number, height: number, rotation: TouchPanelEntry["panel"]["rotation"]) => void;
  onIdentify: () => void;
}

/** What one step says and asks for. */
function StepBody({ step, busy, screens, panel, port, deviceTrouble, tap, onEnable, onPair, onCancel, onSize, onIdentify }: StepBodyProps) {
  switch (step) {
    case "enable":
      return (
        <>
          <span>Touch panels are off. Turn them on so Studio reads the touchscreen itself: touching it never moves the mouse.</span>
          <span>
            <Button kind="accent" disabled={busy !== null} onClick={onEnable}>
              Turn on touch panels
            </Button>
          </span>
        </>
      );
    case "driver": {
      if (screens === null) return <span>Looking for touchscreens…</span>;
      const owned = screens.find((s) => !s.ready);
      if (!owned) return <span>No touchscreen found. Plug in the display's touch USB cable; it shows up here by itself.</span>;
      return (
        <>
          <span className="text-s-amber">
            {owned.product ?? "The touchscreen"}: Windows owns it, so Studio can't read it yet. Give it the WinUSB driver; this step finishes by itself when it's ready.
          </span>
          <ZadigSteps screen={owned} />
        </>
      );
    }
    case "pair":
      return busy === "pair" ? (
        <>
          <span>
            {panel?.monitor ? (
              <>
                Touch the screen that says <b className="text-s-t1">Touch this screen</b>.
              </>
            ) : (
              "Tap the circle on the panel's screen. Every screen but the main one shows one; tap only this panel's."
            )}
          </span>
          <span>
            <Button onClick={onCancel}>Cancel</Button>
          </span>
        </>
      ) : (
        <>
          <span>Studio shows a target on the screens. Touching it on this panel tells Studio which touchscreen and which display belong together, and sets its size.</span>
          <span>
            <Button kind="accent" disabled={busy !== null} onClick={onPair}>
              Pair…
            </Button>
          </span>
        </>
      );
    case "size":
      return panel ? <SizeStep panel={panel} busy={busy !== null} onSize={onSize} /> : null;
    case "show":
      return panel ? (
        <>
          <span>Once, in InfoPanel; which screen it shows is chosen in Studio afterwards, never in the address.</span>
          <ShowSteps url={panelKioskUrl(port, panel.id)} />
          <span className="text-s-muted">Waiting for its kiosk to open: this step finishes by itself.</span>
        </>
      ) : null;
    case "test":
      return (
        <>
          <span>{tap ? `Got a tap at ${tap.x}, ${tap.y}.` : "Tap the panel once. The tap shows here, and the kiosk on the panel reacts to it."}</span>
          {deviceTrouble && <span className="text-s-amber">{deviceTrouble}</span>}
          <span>
            <Button disabled={busy !== null} onClick={onIdentify}>
              Show its name on the panel
            </Button>
          </span>
        </>
      );
  }
}

/** Size and rotation, prefilled from the display pairing found; "Looks right" confirms them. */
function SizeStep({ panel, busy, onSize }: { panel: TouchPanelEntry; busy: boolean; onSize: StepBodyProps["onSize"] }) {
  const [width, setWidth] = useState(panel.panel.width_px);
  const [height, setHeight] = useState(panel.panel.height_px);
  const [rotation, setRotation] = useState(panel.panel.rotation);
  const touched = useRef(false);
  useEffect(() => {
    if (touched.current) return;
    setWidth(panel.panel.width_px);
    setHeight(panel.panel.height_px);
  }, [panel.panel.width_px, panel.panel.height_px]);
  return (
    <>
      <span>{panel.monitor ? "Taken from its display. The kiosk page must fill exactly this many pixels." : "The panel's resolution in pixels: the kiosk page must fill exactly this."}</span>
      <span className="flex items-center gap-2">
        <Field label="Width" numeric value={width} width="w-24" onCommit={(v) => ((touched.current = true), setWidth(Number(v)))} />
        <span className="text-s-dim">×</span>
        <Field label="Height" numeric value={height} width="w-24" unit="px" onCommit={(v) => ((touched.current = true), setHeight(Number(v)))} />
      </span>
      <span>Mounted sideways? Turn touches to match, clockwise.</span>
      <Segmented size="sm" label="Rotation" options={[...ROTATIONS]} value={rotation} onChange={setRotation} className="self-start" />
      <span>
        <Button kind="accent" disabled={busy} onClick={() => onSize(width, height, rotation)}>
          Looks right
        </Button>
      </span>
    </>
  );
}
