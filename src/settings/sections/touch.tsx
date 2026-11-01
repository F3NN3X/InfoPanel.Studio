import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, FileJson, Hand, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorText, ipc } from "../ipc";
import { useFound, useStore } from "../store";
import type { Json, Touchscreen, TouchPanelEntry, TouchStatus, TouchView } from "../types";
import { Button, Card, Group, Row, Segmented, Switch, SwitchRow, useFlag } from "../ui";

/** The view is re-read this often while the page is open: the devices' status changes by itself. */
const VIEW_POLL_MS = 1000;
/** Touchscreens are listed this often, so a device turns ready the moment Zadig is done. */
const SCREENS_POLL_MS = 2000;

const ROTATIONS = [
  { value: "0", label: "0°" },
  { value: "90", label: "90°" },
  { value: "180", label: "180°" },
  { value: "270", label: "270°" },
] as const;

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

const hex = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");
/** The tail of a USB location, which tells two ports apart (`…USBROOT(0)-4.2` → `4.2`). */
const shortPort = (p: string) => p.slice(p.lastIndexOf("-") + 1);

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

/** The kiosk URL of panel `id`: always this computer, since the touch stream answers only there. */
export const panelKioskUrl = (port: number, id: string) => `http://127.0.0.1:${port}/?kiosk=1&touch=${encodeURIComponent(id)}`;

/** A field that saves on Enter or when it loses focus. */
function Field({ value, onCommit, label, numeric, step, unit, width = "w-28" }: { value: string | number; onCommit: (v: string) => void; label: string; numeric?: boolean; step?: number; unit?: string; width?: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    if (draft !== String(value)) onCommit(draft);
  };
  return (
    <span className="flex items-center gap-1.5">
      <input
        value={draft}
        aria-label={label}
        type={numeric ? "number" : "text"}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className={cn("h-[34px] rounded-lg border border-s-input-line bg-s-input px-2.5 text-[13px] text-s-t1 outline-none", width)}
      />
      {unit && <span className="text-xs text-s-dim">{unit}</span>}
    </span>
  );
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

type SetKey = (key: string, value: Json) => Promise<boolean>;

/** The setup step running on the touch displays (one at a time), and how to start one. */
interface Steps {
  running: string | null;
  run: <T>(what: string, step: () => Promise<T>, done: (result: T) => string) => Promise<void>;
}

function useSteps(refresh: () => void): Steps {
  const { toast } = useStore();
  const [running, setRunning] = useState<string | null>(null);
  const run: Steps["run"] = async (what, step, done) => {
    setRunning(what);
    try {
      toast(done(await step()));
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      setRunning(null);
      refresh();
    }
  };
  return { running, run };
}

interface PanelCardProps {
  view: TouchView;
  entry: TouchPanelEntry;
  index: number;
  setKey: SetKey;
  steps: Steps;
  onRemove: () => void;
}

function PanelCard({ view, entry, index, setKey, steps, onRemove }: PanelCardProps) {
  const { settings, status, toast } = useStore();
  const [copied, flash] = useFlag();
  const [confirm, setConfirm] = useState(false);
  const state = view.panels.find((p) => !p.is_virtual && p.id === entry.id)?.status;
  const port = state?.status === "Connected" ? state.port : null;
  const line = statusLine(state);
  const url = panelKioskUrl(status.runningConfig?.port ?? settings.port, entry.id);
  const set = (key: string, value: Json) => void setKey(`panels.${index}.${key}`, value);
  const copy = () => void navigator.clipboard.writeText(url).then(flash, () => toast("Could not copy.", true));
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 px-[18px] py-3.5">
        <div className="flex min-w-40 flex-1 flex-col gap-[3px]">
          <span className="text-sm font-medium">{entry.name}</span>
          <span className={cn("text-[12.5px]", line.className)}>{line.text}</span>
        </div>
        {confirm ? (
          <>
            <Button onClick={() => setConfirm(false)}>Keep</Button>
            <Button onClick={onRemove}>Remove {entry.name}</Button>
          </>
        ) : (
          <Button kind="quiet" onClick={() => setConfirm(true)} title="Remove this panel">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2.5 px-[18px] py-3.5">
        <span className="text-[12.5px] leading-[1.45] text-s-muted">
          Open this in an InfoPanel web page profile shown full screen on this panel's display, with Interactive off. Add <span className="font-mono">&amp;profile=…</span> to pin a screen.
        </span>
        <div className="flex flex-wrap gap-2">
          <div className="flex h-9 min-w-0 basis-40 flex-1 items-center truncate rounded-lg border border-s-track-line bg-s-win px-3 font-mono text-[13px]">{url}</div>
          <Button size="md" className="h-9" onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      <Row
        label="On its screen"
        hint={
          entry.panel.calibration
            ? "Calibrated. Calibrate again if touches land beside where you tap."
            : "Pair finds its touchscreen by a touch on its screen. Calibrate if touches land beside where you tap."
        }
      >
        <span className="flex flex-wrap gap-2">
          <Button disabled={steps.running !== null} onClick={() => void steps.run("identify", () => ipc.touchIdentify(index), () => `${entry.name} is showing its name.`)}>
            Identify
          </Button>
          <Button disabled={steps.running !== null} onClick={() => void steps.run(`pair ${entry.name}`, () => ipc.touchPair(index), (p) => `${entry.name} is paired with USB port ${shortPort(p)}.`)}>
            Pair…
          </Button>
          <Button
            disabled={steps.running !== null || port === null}
            title={port === null ? "Its touchscreen isn't connected" : undefined}
            onClick={() => void steps.run(`calibrate ${entry.name}`, () => ipc.touchCalibrate(index), (e) => `${entry.name} is calibrated (${e.toFixed(1)} px off).`)}
          >
            Calibrate…
          </Button>
          {entry.panel.calibration !== null && (
            <Button disabled={steps.running !== null} onClick={() => set("panel.calibration", null)}>
              Reset
            </Button>
          )}
        </span>
      </Row>
      <Row label="Name">
        <Field label="Name" value={entry.name} width="w-44" onCommit={(v) => set("name", v.trim() || null)} />
      </Row>
      <Row label="Id" hint="In the kiosk URL. Changing it changes the URL.">
        <Field label="Id" value={entry.id} width="w-44" onCommit={(v) => set("id", v.trim())} />
      </Row>
      <Row label="Size" hint="The panel's resolution in pixels: what touches map onto, and what the kiosk page must fill.">
        <span className="flex items-center gap-2">
          <Field label="Width" numeric value={entry.panel.width_px} width="w-24" onCommit={(v) => set("panel.width_px", Number(v))} />
          <span className="text-s-dim">×</span>
          <Field label="Height" numeric value={entry.panel.height_px} width="w-24" unit="px" onCommit={(v) => set("panel.height_px", Number(v))} />
        </span>
      </Row>
      <Row label="Rotation" hint="Clockwise, applied to touches, for a digitizer mounted turned.">
        <Segmented size="sm" label="Rotation" options={[...ROTATIONS]} value={entry.panel.rotation} onChange={(v) => set("panel.rotation", v)} />
      </Row>
      <SwitchRow label="Mirror horizontally" checked={entry.panel.flip_x} onChange={(v) => set("panel.flip_x", v)} />
      <SwitchRow label="Mirror vertically" checked={entry.panel.flip_y} onChange={(v) => set("panel.flip_y", v)} />
      <Row
        label="USB port"
        hint={
          entry.device.port
            ? `Pinned to port ${shortPort(entry.device.port)}. Unpin to take the first free touchscreen.`
            : "Not pinned: takes the first free touchscreen. Pin it when you have more than one."
        }
      >
        {entry.device.port ? (
          <Button onClick={() => set("device.port", null)}>Unpin</Button>
        ) : (
          port && <Button onClick={() => set("device.port", port)}>Pin to {shortPort(port)}</Button>
        )}
      </Row>
    </Card>
  );
}

/** What the touch displays show while a step runs, as Settings words it. */
function stepText(running: string): string {
  if (running === "setup") return "Tap the circle on each touch display. Setup ends by itself once every display is done.";
  if (running.startsWith("pair ")) return `Touch the screen that says “Touch this screen” to pair ${running.slice(5)}.`;
  if (running.startsWith("calibrate ")) return `Tap the four circles on ${running.slice(10)}'s screen, one after another.`;
  return "Showing the panel's name on its screen.";
}

function PanelsGroup({ view, setKey, steps }: { view: TouchView; setKey: SetKey; steps: Steps }) {
  const panels = view.effective.panels;
  const filePanels = Array.isArray(view.file?.panels) ? (view.file.panels as Json[]) : null;
  // Without a `panels` key the config is one default panel; writing it out first means the same.
  const base = (): Json[] => filePanels ?? panels.map(() => ({}));
  const freeId = () => {
    let n = panels.length + 1;
    while (panels.some((p) => p.id === `panel-${n}`)) n++;
    return n;
  };
  const add = () => {
    const n = freeId();
    void setKey("panels", [...base(), { id: `panel-${n}`, name: `Panel ${n}` }]);
  };
  // A panel's own key needs the `panels` list written out first.
  const panelSet: SetKey = async (key, value) => {
    if (!filePanels && !(await setKey("panels", base()))) return false;
    return setKey(key, value);
  };
  return (
    <Group title="Panels">
      <Card>
        <Row
          label={steps.running && steps.running !== "identify" ? "On the touch displays" : "Set up panels"}
          hint={
            steps.running && steps.running !== "identify"
              ? stepText(steps.running)
              : "Shows a circle on every screen but the main one. Tapping it on a touch display tells Studio which touchscreen belongs to which display, and sets the panel's size."
          }
        >
          {steps.running && steps.running !== "identify" ? (
            <Button onClick={() => void ipc.touchCancel()}>{steps.running === "setup" ? "Finish" : "Cancel"}</Button>
          ) : (
            <Button
              disabled={steps.running !== null}
              onClick={() =>
                void steps.run("setup", ipc.touchSetup, (bound) =>
                  bound.length ? `Set up ${bound.map((b) => b.monitor).join(", ")}.` : "Nothing was set up."
                )
              }
            >
              Set up panels…
            </Button>
          )}
        </Row>
      </Card>
      {panels.length === 0 && <div className="text-[12.5px] text-s-muted">No panels. Add one for each touch display.</div>}
      {panels.map((p, i) => (
        <PanelCard key={`${i}-${p.id}`} view={view} entry={p} index={i} setKey={panelSet} steps={steps} onRemove={() => void setKey("panels", base().filter((_, j) => j !== i))} />
      ))}
      <div>
        <Button onClick={add}>
          <Plus className="h-4 w-4" />
          Add panel
        </Button>
      </div>
    </Group>
  );
}

function ZadigSteps({ screen }: { screen: Touchscreen }) {
  const { toast } = useStore();
  return (
    <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 text-[12.5px] leading-[1.5] text-s-t2 marker:text-s-dim">
      <li>
        Download Zadig from its official site.{" "}
        <button type="button" className="cursor-pointer text-s-accent-text underline" onClick={() => void ipc.openExternal("https://zadig.akeo.ie").catch((e) => toast(errorText(e), true))}>
          zadig.akeo.ie
        </button>
      </li>
      <li>Run it. Choose Options › List All Devices, and untick Ignore Hubs or Composite Parents.</li>
      <li>
        Pick <b className="text-s-t1">{screen.product ?? "the touch panel"}</b> and check the USB ID reads exactly{" "}
        <span className="rounded bg-s-win px-1.5 font-mono text-s-t1">{hex(screen.vid)}</span> <span className="rounded bg-s-win px-1.5 font-mono text-s-t1">{hex(screen.pid)}</span>. Picking your
        keyboard or mouse instead is the classic mistake.
      </li>
      <li>Set the target driver to WinUSB and click Replace Driver (or Install Driver).</li>
      <li>Come back here: the touchscreen turns ready by itself. Windows touch on that screen stops; that's the point.</li>
    </ol>
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
          <span className="text-[13.5px] font-medium">
            {screen.product ?? "Touchscreen"} <span className="font-mono text-xs text-s-dim">{hex(screen.vid)}:{hex(screen.pid)} · port {shortPort(screen.port)}</span>
          </span>
          <span className={cn("text-[12.5px]", screen.ready ? "text-s-green" : "text-s-amber")}>
            {screen.ready ? "WinUSB · ready: Studio reads it, Windows doesn't" : `${screen.driver ?? "No driver"} · Windows owns it: it needs the WinUSB driver`}
          </span>
        </div>
        {screen.ready &&
          (busy ? (
            <span className="text-xs text-s-muted">Waiting for the Windows admin prompt…</span>
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
        <span className="text-pretty text-[12.5px] leading-normal text-s-amber">
          Windows takes this touchscreen back: touches move the cursor on that screen again and the kiosk stops getting them. Windows asks for admin permission once, and the certificate Zadig added
          for it is removed too.
        </span>
      )}
      {!screen.ready && <ZadigSteps screen={screen} />}
    </div>
  );
}

function ScreensGroup() {
  const [screens, setScreens] = useState<Touchscreen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const found = useFound("touch-screens");
  useEffect(() => {
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
  }, []);
  return (
    <Group title="Touchscreens">
      <div ref={found.ref} className={cn("divide-y divide-s-divider overflow-hidden rounded-xl border border-s-card-line bg-s-card", found.className)}>
        {error ? (
          <div className="px-[18px] py-3.5 text-[12.5px] text-s-red">Could not list USB devices: {error}</div>
        ) : !screens ? (
          <div className="px-[18px] py-3.5 text-[12.5px] text-s-muted">Looking for touchscreens…</div>
        ) : screens.length === 0 ? (
          <div className="px-[18px] py-3.5 text-[12.5px] text-s-muted">No touchscreen found. Plug in the display's touch USB cable; it shows up here by itself, with the steps to set it up.</div>
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
          <SwitchRow label="Touch dots" hint="Rings under every finger on the kiosk, for demos and recordings." checked={e.touch_dots} onChange={(v) => void setKey("touch_dots", v)} />
          <SwitchRow label="Debug strip" hint="The touch status, the last gesture and the delay from Studio, along the kiosk's bottom edge. A three-finger tap toggles it." checked={e.debug} onChange={(v) => void setKey("debug", v)} />
          <Row label="Prediction" hint="How far ahead touch dots draw a moving finger, to hide display delay.">
            <Field label="Prediction" numeric value={e.prediction_ms} width="w-20" unit="ms" onCommit={(v) => void setKey("prediction_ms", Number(v))} />
          </Row>
          {THRESHOLDS.map((t) => (
            <Row key={t.key} label={t.label} hint={`${t.hint} Default ${view.defaults.gestures[t.key]} ${t.unit}.`}>
              <Field label={t.label} numeric step={t.step} value={e.gestures[t.key]} width="w-20" unit={t.unit} onCommit={(v) => void setKey(`gestures.${t.key}`, Number(v))} />
            </Row>
          ))}
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

export function TouchSection() {
  const { settings, save, toast } = useStore();
  const { view, refresh } = useTouchView();
  const steps = useSteps(refresh);
  const found = useFound("touch");
  const [busy, setBusy] = useState(false);
  const enabled = settings.experimentalTouch;

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

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-s-card-line bg-s-card">
        <div ref={found.ref} className={cn("flex items-center gap-4 px-[18px] py-4", found.className)}>
          <div className="grid h-9 w-9 place-items-center rounded-[9px] bg-ui-hover text-s-t2">
            <Hand className="h-5 w-5" />
          </div>
          <div className="flex flex-1 flex-col gap-[3px]">
            <span className="flex items-center gap-2 text-sm font-medium">
              Touch panels
              <span className="rounded-[10px] bg-s-amber/14 px-2 py-0.5 text-[11px] font-normal text-s-amber">Experimental</span>
            </span>
            <span className="text-[12.5px] leading-[1.45] text-s-muted">
              Studio reads USB touch displays itself, so touching one never moves the mouse or takes focus from what you're doing; the kiosk on that display gets the touches.
            </span>
          </div>
          <Switch checked={enabled} onChange={(v) => void toggle(v)} label="Touch panels" disabled={busy} />
        </div>
      </div>
      {enabled && view && (
        <>
          {(view.file_error || view.issues.length > 0) && (
            <div className="flex flex-col gap-1 rounded-xl border border-s-card-line bg-s-card px-[18px] py-3.5 text-[12.5px]">
              {view.file_error && <span className="text-s-red">touch.json doesn't parse: {view.file_error}</span>}
              {view.issues.map((i) => (
                <span key={i.message} className={i.level === "error" ? "text-s-red" : "text-s-amber"}>
                  {i.level === "error" ? "Not applied: " : ""}
                  {i.message}
                </span>
              ))}
            </div>
          )}
          <PanelsGroup view={view} setKey={setKey} steps={steps} />
          <ScreensGroup />
          <KioskGroup view={view} setKey={setKey} />
          <TestingGroup view={view} setKey={setKey} />
        </>
      )}
    </>
  );
}
