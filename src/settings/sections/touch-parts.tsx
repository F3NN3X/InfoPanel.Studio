import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CONFIG_URL } from "@/lib/dashboard-server";
import { CONTROL_URL, type ControlDisplay, type ControlState } from "@/lib/control";
import { errorText, ipc } from "../ipc";
import { useStore } from "../store";
import type { Json, Touchscreen } from "../types";

/** The parts Settings › Touch's page, its panel cards and its guided setup share. */

export type SetKey = (key: string, value: Json) => Promise<boolean>;

/** The setup step running on the touch displays (one at a time), and how to start one. */
export interface Steps {
  running: string | null;
  run: <T>(what: string, step: () => Promise<T>, done: (result: T) => string) => Promise<void>;
}

export function useSteps(refresh: () => void): Steps {
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

export const ROTATIONS = [
  { value: "0", label: "0°" },
  { value: "90", label: "90°" },
  { value: "180", label: "180°" },
  { value: "270", label: "270°" },
] as const;

export const hex = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");
/** The tail of a USB location, which tells two ports apart (`…USBROOT(0)-4.2` → `4.2`). */
export const shortPort = (p: string) => p.slice(p.lastIndexOf("-") + 1);

/** A field that saves on Enter or when it loses focus. */
export function Field({ value, onCommit, label, numeric, step, unit, width = "w-28" }: { value: string | number; onCommit: (v: string) => void; label: string; numeric?: boolean; step?: number; unit?: string; width?: string }) {
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
        className={cn("h-(--ui-h-field) rounded-lg border border-s-input-line bg-s-input px-2.5 text-body text-s-t1 outline-none", width)}
      />
      {unit && <span className="text-caption text-s-dim">{unit}</span>}
    </span>
  );
}

/** How to give a touchscreen Windows owns to Studio: Zadig, with the exact USB id to pick. */
export function ZadigSteps({ screen }: { screen: Touchscreen }) {
  const { toast } = useStore();
  return (
    <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 text-caption leading-[1.5] text-s-t2 marker:text-s-dim">
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

/** A screen of the dashboard, for the Shows picker. */
export interface ScreenName {
  id: string;
  name: string;
}

/** The control state is read this often while the page is open. */
const CONTROL_POLL_MS = 2000;

/**
 * What ties a panel to the dashboard: the named displays on the control channel (a panel's kiosk is the display named
 * after it) and the screens one can show, read once from the server's config. The control state is polled, never
 * streamed: the Settings and Studio windows share the browser's six connections to the server, and the Studio's
 * streams already hold most of them.
 */
export function useDashboardLinks(): { displays: readonly ControlDisplay[]; screens: readonly ScreenName[] } {
  const [displays, setDisplays] = useState<readonly ControlDisplay[]>([]);
  const [screens, setScreens] = useState<readonly ScreenName[]>([]);
  useEffect(() => {
    let alive = true;
    const json = <T,>(url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<T>) : null));
    json<{ profiles?: ScreenName[] }>(CONFIG_URL)
      .then((c) => alive && setScreens((c?.profiles ?? []).map(({ id, name }) => ({ id, name }))))
      .catch(() => {});
    const read = () =>
      void json<ControlState>(CONTROL_URL)
        .then((c) => alive && c && setDisplays(c.displays ?? []))
        .catch(() => {});
    read();
    const timer = window.setInterval(read, CONTROL_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  return { displays, screens };
}
