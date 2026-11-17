import { lazy, Suspense, useCallback, useContext, useEffect, useState } from "react";
import { ChevronRight, ExternalLink, FileJson, Hand, Plus } from "lucide-react";
import type { ControlDisplay } from "@/lib/control";
import { takeTouchIntent, type TouchIntent } from "@/lib/touch/intent";
import { panelKioskUrl } from "@/lib/touch/panels";
import { cn } from "@/lib/utils";
import { FoundContext } from "../found";
import { errorText, ipc } from "../ipc";
import { useFound, useStore } from "../store";
import type { Json, Touchscreen, TouchStatus, TouchView } from "../types";
import { Button, Card, Group, Row, Segmented, Switch, SwitchRow } from "../ui";
import { PanelCard } from "./touch-panel-card";
import { Field, hex, shortPort, useDashboardLinks, useSteps, ZadigSteps, type ScreenName, type SetKey, type Steps } from "./touch-parts";
import type { SetupTarget } from "./touch-setup-dialog";

/** The guided setup: a lazy chunk, loaded the first time it opens. */
const TouchSetupDialog = lazy(() => import("./touch-setup-dialog"));

/** The view is re-read this often while the page is open: the devices' status changes by itself. */
const VIEW_POLL_MS = 1000;
/** Touchscreens are listed this often, so a device turns ready the moment Zadig is done. */
const SCREENS_POLL_MS = 2000;

const REPLAYS = [
  { value: "all", label: "All, in turn" },
  { value: "tap", label: "Taps" },
  { value: "swipes", label: "Swipes" },
  { value: "two-finger", label: "Two fingers" },
  { value: "hold", label: "Holds" },
  { value: "none", label: "Nothing" },
] as const;

interface Threshold {
  key: string;
  label: string;
  hint: string;
  unit: string;
  step?: number;
}

// The thresholds touch-core's recogniser uses (touch-kit's spec defaults).
const THRESHOLDS: Threshold[] = [
  { key: "slop_px", label: "Tap slop", hint: "Movement that still counts as a tap.", unit: "px" },
  { key: "long_press_ms", label: "Long press", hint: "Hold time for a long press.", unit: "ms" },
  { key: "double_tap_gap_ms", label: "Double tap gap", hint: "Longest pause between the two taps.", unit: "ms" },
  { key: "swipe_min_px", label: "Swipe distance", hint: "A stroke longer than this is a swipe at any speed.", unit: "px" },
  { key: "flick_min_speed", label: "Flick speed", hint: "A shorter stroke still swipes if faster than this.", unit: "px/ms", step: 0.05 },
  { key: "multi_finger_window_ms", label: "Finger window", hint: "Fingers landing within this time form one gesture.", unit: "ms" },
];

/** The value at a dotted path in the file, or undefined when the file doesn't set it. */
export function fileValue(file: TouchView["file"], key: string): Json | undefined {
  let node: Json | undefined = file;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = Array.isArray(node) ? node[Number(part)] : node[part];
  }
  return node;
}

/** How a panel's touch device is doing, in a few words, and its tone. */
export function statusLine(s: TouchStatus | null | undefined): { text: string; className: string } {
  if (!s) return { text: "Starting", className: "text-s-muted" };
  switch (s.status) {
    case "Connected":
      return { text: `Touch connected · USB port ${shortPort(s.port)}`, className: "text-s-green" };
    case "Disconnected":
      return { text: "Touchscreen not found", className: "text-s-red" };
    case "Error":
      return { text: s.message, className: "text-s-amber" };
    case "Stopped":
      return { text: "Stopped", className: "text-s-muted" };
  }
}

function useTouchView(): { view: TouchView | null; refresh: () => void } {
  const [view, setView] = useState<TouchView | null>(null);
  const refresh = useCallback(() => void ipc.touchView().then(setView, () => {}), []);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, VIEW_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return { view, refresh };
}

/** What the touch displays show while a step runs, as Settings words it. */
function stepText(running: string): string {
  if (running.startsWith("pair ")) return `Touch the screen that says “Touch this screen” to pair ${running.slice(5)}.`;
  if (running.startsWith("calibrate ")) return `Tap the four circles on ${running.slice(10)}'s screen, one after another.`;
  return "Showing the panel's name on its screen.";
}

/** touch.json's panel list as edits need it: a panel's own key needs the list written out first. */
interface PanelKeys {
  /** Sets a key, writing the panel list out first when the file has none. */
  set: SetKey;
  add: () => void;
  remove: (index: number) => void;
}

function usePanelKeys(view: TouchView | null, setKey: SetKey): PanelKeys {
  const panels = view?.effective.panels ?? [];
  const filePanels = Array.isArray(view?.file?.panels) ? (view.file.panels as Json[]) : null;
  // Without a `panels` key the config is one default panel; writing it out first means the same.
  const base = (): Json[] => filePanels ?? panels.map(() => ({}));
  return {
    set: async (key, value) => {
      if (key.startsWith("panels.") && !filePanels && !(await setKey("panels", base()))) return false;
      return setKey(key, value);
    },
    add: () => {
      let n = panels.length + 1;
      while (panels.some((p) => p.id === `panel-${n}`)) n++;
      void setKey("panels", [...base(), { id: `panel-${n}`, name: `Panel ${n}` }]);
    },
    remove: (index) => void setKey("panels", base().filter((_, j) => j !== index)),
  };
}

interface PanelsGroupProps {
  view: TouchView;
  keys: PanelKeys;
  steps: Steps;
  screens: readonly Touchscreen[] | null;
  displays: readonly ControlDisplay[];
  dashboardScreens: readonly ScreenName[];
  port: number;
  /** The panel Screens asked to remove: its card asks to confirm. */
  removing: string | null;
  onSetup: (target: SetupTarget) => void;
}

function PanelsGroup({ view, keys, steps, screens, displays, dashboardScreens, port, removing, onSetup }: PanelsGroupProps) {
  const panels = view.effective.panels;
  const onDisplays = steps.running && steps.running !== "identify";
  return (
    <Group title="Panels">
      <Card id="setup">
        <Row
          label={onDisplays ? "On the touch displays" : "Set up a panel"}
          hint={onDisplays ? stepText(steps.running ?? "") : "Step by step: the driver, which screen it is, its size, and the page to show in InfoPanel. Also on each display's card on Screens."}
        >
          {onDisplays ? (
            <Button onClick={() => void ipc.touchCancel()}>Cancel</Button>
          ) : (
            <Button kind="accent" disabled={steps.running !== null} onClick={() => onSetup({})}>
              Set up a panel…
            </Button>
          )}
        </Row>
      </Card>
      {panels.length === 0 && <div className="text-caption text-s-muted">No panels. Set one up for each touch display.</div>}
      {panels.map((p, i) => (
        <PanelCard
          key={`${i}-${p.id}`}
          view={view}
          entry={p}
          index={i}
          setKey={keys.set}
          steps={steps}
          screens={screens}
          displays={displays}
          dashboardScreens={dashboardScreens}
          port={port}
          confirmRemove={removing === p.id}
          onRemove={() => keys.remove(i)}
          onSetup={() => onSetup({ panel: p.id })}
        />
      ))}
      <div>
        <Button onClick={keys.add}>
          <Plus className="h-4 w-4" />
          Add panel by hand
        </Button>
      </div>
    </Group>
  );
}

function ScreenRow({ screen }: { screen: Touchscreen }) {
  const { toast } = useStore();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const uninstall = async () => {
    setConfirm(false);
    setBusy(true);
    try {
      const r = await ipc.touchUninstallDriver(screen.vid, screen.pid);
      toast(r.changed ? "Given back to Windows. Its touch works there again." : "Nothing was bound to WinUSB.");
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3 px-[18px] py-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-40 flex-1 flex-col gap-[3px]">
          <span className="text-body font-medium">
            {screen.product ?? "Touchscreen"} <span className="font-mono text-caption text-s-dim">{hex(screen.vid)}:{hex(screen.pid)} · port {shortPort(screen.port)}</span>
          </span>
          <span className={cn("text-caption", screen.ready ? "text-s-green" : "text-s-amber")}>
            {screen.ready ? "WinUSB · ready: Studio reads it, Windows doesn't" : `${screen.driver ?? "No driver"} · Windows owns it: it needs the WinUSB driver`}
          </span>
        </div>
        {screen.ready &&
          (busy ? (
            <span className="text-caption text-s-muted">Waiting for the Windows admin prompt…</span>
          ) : confirm ? (
            <>
              <Button onClick={() => setConfirm(false)}>Keep</Button>
              <Button onClick={() => void uninstall()}>Give back to Windows</Button>
            </>
          ) : (
            <Button onClick={() => setConfirm(true)}>Uninstall…</Button>
          ))}
      </div>
      {confirm && (
        <span className="text-pretty text-caption leading-normal text-s-amber">
          Windows takes this touchscreen back: touches move the cursor on that screen again and the kiosk stops getting them. Windows asks for admin permission once, and the certificate Zadig added
          for it is removed too.
        </span>
      )}
      {!screen.ready && <ZadigSteps screen={screen} />}
    </div>
  );
}

function ScreensGroup({ screens, error }: { screens: readonly Touchscreen[] | null; error: string | null }) {
  const found = useFound("touch-screens");
  return (
    <Group title="Touchscreens">
      <div ref={found.ref} className={cn("divide-y divide-s-divider overflow-hidden rounded-xl border border-s-card-line bg-s-card", found.className)}>
        {error ? (
          <div className="px-[18px] py-3.5 text-caption text-s-red">Could not list USB devices: {error}</div>
        ) : !screens ? (
          <div className="px-[18px] py-3.5 text-caption text-s-muted">Looking for touchscreens…</div>
        ) : screens.length === 0 ? (
          <div className="px-[18px] py-3.5 text-caption text-s-muted">No touchscreen found. Plug in the display's touch USB cable; it shows up here by itself, with the steps to set it up.</div>
        ) : (
          screens.map((s) => <ScreenRow key={s.port} screen={s} />)
        )}
      </div>
    </Group>
  );
}

function KioskGroup({ view, setKey }: { view: TouchView; setKey: SetKey }) {
  const e = view.effective;
  const found = useFound("touch-gestures");
  return (
    <Group title="Gestures and the kiosk">
      <div ref={found.ref} className={cn("rounded-xl", found.className)}>
        <Card>
          <SwitchRow label="Touch dots" hint="Rings under every finger on the kiosk, for demos and recordings" checked={e.touch_dots} onChange={(v) => void setKey("touch_dots", v)} />
          <SwitchRow label="Debug strip" hint="The touch status, the last gesture and the delay from Studio, along the kiosk's bottom edge. A three-finger tap toggles it." checked={e.debug} onChange={(v) => void setKey("debug", v)} />
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-[18px] py-3.5 text-body font-medium">
              <ChevronRight className="h-4 w-4 text-s-dim transition-transform group-open:rotate-90" />
              Gesture tuning
            </summary>
            <div className="divide-y divide-s-divider border-t border-s-divider">
              <Row label="Prediction" hint="How far ahead touch dots draw a moving finger, to hide display delay">
                <Field label="Prediction" numeric value={e.prediction_ms} width="w-20" unit="ms" onCommit={(v) => void setKey("prediction_ms", Number(v))} />
              </Row>
              {THRESHOLDS.map((t) => (
                <Row key={t.key} label={t.label} hint={`${t.hint} Default ${view.defaults.gestures[t.key]} ${t.unit}.`}>
                  <Field label={t.label} numeric step={t.step} value={e.gestures[t.key]} width="w-20" unit={t.unit} onCommit={(v) => void setKey(`gestures.${t.key}`, Number(v))} />
                </Row>
              ))}
            </div>
          </details>
          <Row label="Gesture actions" hint="Two-finger swipes change the page and a three-finger tap shows the debug strip. Other gestures and actions go in touch.json.">
            <Button onClick={() => void ipc.revealPath(view.path).catch(() => {})}>
              <FileJson className="h-4 w-4" />
              Show touch.json
            </Button>
          </Row>
        </Card>
      </div>
    </Group>
  );
}

function TestingGroup({ view, setKey }: { view: TouchView; setKey: SetKey }) {
  const t = view.effective.testing;
  const found = useFound("touch-testing");
  const virtuals = view.panels.filter((p) => p.is_virtual);
  const replays = REPLAYS.some((r) => r.value === t.replay) ? [...REPLAYS] : [...REPLAYS, { value: t.replay, label: "File" }];
  return (
    <Group title="Testing">
      <div ref={found.ref} className={cn("rounded-xl", found.className)}>
        <Card>
          <SwitchRow
            label="Virtual panels"
            hint="Panels that play touches recorded on a real one, in a loop, so you can try touch without the hardware. Open their kiosk URL in a browser."
            checked={t.enabled}
            onChange={(v) => void setKey("testing.enabled", v)}
          />
          {t.enabled && (
            <>
              <Row label="Count">
                <Segmented size="sm" label="Virtual panels" options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))} value={t.virtual_panels} onChange={(v) => void setKey("testing.virtual_panels", v)} />
              </Row>
              <Row label="Plays">
                <Segmented size="sm" label="Recording" options={replays} value={t.replay} onChange={(v) => void setKey("testing.replay", v)} />
              </Row>
              {virtuals.map((p) => (
                <VirtualRow key={p.id} id={p.id} name={p.name} status={p.status} />
              ))}
            </>
          )}
        </Card>
      </div>
    </Group>
  );
}

function VirtualRow({ id, name, status }: { id: string; name: string; status: TouchStatus | null }) {
  const { settings, status: server, toast } = useStore();
  const url = panelKioskUrl(server.runningConfig?.port ?? settings.port, id);
  const line = statusLine(status);
  return (
    <Row label={name} hint={<span className={line.className}>{line.text}</span>}>
      <Button onClick={() => void ipc.openExternal(url).catch((e) => toast(errorText(e), true))}>
        <ExternalLink className="h-4 w-4" />
        Open its kiosk
      </Button>
    </Row>
  );
}

/** The touch steps Screens' display cards ask for (`touch/<action>`, the request `takeTouchIntent` reads). */
const INTENT_ROWS = new Set(["setup", "identify", "calibrate", "remove"]);

/** The touchscreens plugged in, listed every 2 s while the page is open and touch is on. */
function useTouchscreens(on: boolean): { screens: Touchscreen[] | null; error: string | null } {
  const [screens, setScreens] = useState<Touchscreen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!on) return;
    const tick = () =>
      void ipc.touchScreens().then(
        (s) => {
          setScreens(s);
          setError(null);
        },
        (e) => setError(errorText(e))
      );
    tick();
    const timer = window.setInterval(tick, SCREENS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [on]);
  return { screens, error };
}

export function TouchSection() {
  const { settings, status, save, toast } = useStore();
  const { view, refresh } = useTouchView();
  const steps = useSteps(refresh);
  const found = useFound("touch");
  const [busy, setBusy] = useState(false);
  const enabled = settings.experimentalTouch;
  const { screens, error } = useTouchscreens(enabled);
  const { displays, screens: dashboardScreens } = useDashboardLinks();
  const port = status.runningConfig?.port ?? settings.port;
  const [setup, setSetup] = useState<SetupTarget | null>(null);
  const [sizeConfirmed, setSizeConfirmed] = useState<ReadonlySet<string>>(new Set());
  const [removing, setRemoving] = useState<string | null>(null);
  /** A step Screens asked for, until the panels are read. */
  const [asked, setAsked] = useState<TouchIntent | null>(null);

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      await save("experimentalTouch", next);
    } finally {
      refresh();
      setBusy(false);
    }
  };

  const setKey: SetKey = async (key, value) => {
    try {
      await ipc.touchSet(key, value);
      refresh();
      return true;
    } catch (e) {
      toast(Array.isArray(e) ? `Not saved: ${e.join("; ")}` : errorText(e), true);
      return false;
    }
  };
  const keys = usePanelKeys(view, setKey);

  // A display card on Screens opened this page on a step: take its request once.
  const jump = useContext(FoundContext);
  useEffect(() => {
    if (!jump || !INTENT_ROWS.has(jump.row)) return;
    const intent = takeTouchIntent();
    if (intent) setAsked(intent);
  }, [jump?.row, jump?.n]);
  useEffect(() => {
    if (!asked) return;
    if (asked.action === "setup") {
      setAsked(null);
      setSetup({ panel: asked.panel, display: asked.display });
      return;
    }
    if (!view) return;
    setAsked(null);
    const index = view.effective.panels.findIndex((p) => p.id === asked.panel);
    const panel = view.effective.panels[index];
    if (!panel) {
      toast("That touch panel is no longer in touch.json.", true);
      return;
    }
    if (asked.action === "remove") setRemoving(panel.id);
    else if (asked.action === "identify") void steps.run("identify", () => ipc.touchIdentify(index), () => `${panel.name} is showing its name.`);
    else void steps.run(`calibrate ${panel.name}`, () => ipc.touchCalibrate(index), (e) => `${panel.name} is calibrated (${e.toFixed(1)} px off).`);
  }, [asked, view]);

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-s-card-line bg-s-card">
        <div ref={found.ref} className={cn("flex items-center gap-4 px-[18px] py-4", found.className)}>
          <div className="grid h-9 w-9 place-items-center rounded-ui-menu bg-s-hover text-s-t2">
            <Hand className="h-5 w-5" />
          </div>
          <div className="flex flex-1 flex-col gap-[3px]">
            <span className="flex items-center gap-2 text-lead font-medium">
              Touch panels
              <span className="rounded-ui-lg bg-s-amber/14 px-2 py-0.5 text-micro font-normal text-s-amber">Experimental</span>
            </span>
            <span className="flex flex-col text-caption leading-[1.45] text-s-muted">
              <span>Studio reads the touchscreen itself, over USB.</span>
              <span>InfoPanel shows the panel's kiosk page full screen on that display.</span>
              <span>Keep Interactive off in InfoPanel, or Windows gets the touches too and moves the mouse.</span>
            </span>
          </div>
          <Switch checked={enabled} onChange={(v) => void toggle(v)} label="Touch panels" disabled={busy} />
        </div>
      </div>
      {!enabled && (
        <div>
          <Button onClick={() => setSetup({})}>Set up a panel…</Button>
        </div>
      )}
      {enabled && view && (
        <>
          {(view.file_error || view.issues.length > 0) && (
            <div className="flex flex-col gap-1 rounded-xl border border-s-card-line bg-s-card px-[18px] py-3.5 text-caption">
              {view.file_error && <span className="text-s-red">touch.json doesn't parse: {view.file_error}</span>}
              {view.issues.map((i) => (
                <span key={i.message} className={i.level === "error" ? "text-s-red" : "text-s-amber"}>
                  {i.level === "error" ? "Not applied: " : ""}
                  {i.message}
                </span>
              ))}
            </div>
          )}
          <PanelsGroup view={view} keys={keys} steps={steps} screens={screens} displays={displays} dashboardScreens={dashboardScreens} port={port} removing={removing} onSetup={setSetup} />
          <ScreensGroup screens={screens} error={error} />
          <KioskGroup view={view} setKey={setKey} />
          <TestingGroup view={view} setKey={setKey} />
        </>
      )}
      {setup && (
        <Suspense fallback={null}>
          <TouchSetupDialog
            view={view}
            target={setup}
            displays={displays}
            port={port}
            setKey={keys.set}
            enable={() => toggle(true)}
            sizeConfirmed={sizeConfirmed}
            onSizeConfirmed={(id) => setSizeConfirmed((done) => new Set(done).add(id))}
            onTarget={setSetup}
            onClose={() => setSetup(null)}
          />
        </Suspense>
      )}
    </>
  );
}
