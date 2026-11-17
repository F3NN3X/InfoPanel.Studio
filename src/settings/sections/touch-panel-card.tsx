import { useEffect, useState } from "react";
import { Check, ChevronRight, Copy, Trash2 } from "lucide-react";
import { DISPLAY_FOLLOW, postControl, type ControlDisplay } from "@/lib/control";
import { statusText } from "@/lib/touch/kiosk";
import { displayOfPanel, linkPin, panelKioskUrl, panelLine, panelState, type PanelState } from "@/lib/touch/panels";
import { cn } from "@/lib/utils";
import { useFound } from "../found";
import { ipc } from "../ipc";
import { useStore } from "../store";
import type { Json, Touchscreen, TouchPanelEntry, TouchView } from "../types";
import { Button, Card, Row, Segmented, SwitchRow, useFlag } from "../ui";
import { Field, ROTATIONS, shortPort, type ScreenName, type SetKey, type Steps } from "./touch-parts";

const LINE_TONE: Record<PanelState, string> = {
  off: "text-s-muted",
  "needs-driver": "text-s-amber",
  "not-paired": "text-s-amber",
  "not-connected": "text-s-red",
  ready: "text-s-green",
};

/** "Show this on the panel's display": what to do in InfoPanel, once; the URL never changes after. */
export function ShowSteps({ url }: { url: string }) {
  const { toast } = useStore();
  const [copied, flash] = useFlag();
  const copy = () => void navigator.clipboard.writeText(url).then(flash, () => toast("Could not copy.", true));
  return (
    <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 text-caption leading-[1.5] text-s-t2 marker:text-s-dim">
      <li>In InfoPanel, add a Web Page profile.</li>
      <li>
        <span>Set its URL to this address:</span>
        <span className="mt-1.5 flex flex-wrap gap-2">
          <span className="flex h-9 min-w-0 basis-40 flex-1 items-center truncate rounded-lg border border-s-track-line bg-s-win px-3 font-mono text-body text-s-t1">{url}</span>
          <Button size="md" className="h-9" onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </span>
      </li>
      <li>Show the profile full screen on the panel's display.</li>
      <li>Turn Interactive off, so Windows doesn't get the touches as well and move the mouse.</li>
    </ol>
  );
}

interface PanelCardProps {
  view: TouchView;
  entry: TouchPanelEntry;
  index: number;
  setKey: SetKey;
  steps: Steps;
  screens: readonly Touchscreen[] | null;
  displays: readonly ControlDisplay[];
  dashboardScreens: readonly ScreenName[];
  port: number;
  /** Ask to remove it (Screens' Remove… landed here). */
  confirmRemove: boolean;
  onRemove: () => void;
  /** The guided setup, for this panel. */
  onSetup: () => void;
}

/**
 * One panel: where it stands in a line and the next thing to do, the screen it shows, how to show it in InfoPanel, the
 * fixes for touches that go wrong, and its settings under Advanced.
 */
export function PanelCard({ view, entry, index, setKey, steps, screens, displays, dashboardScreens, port, confirmRemove, onRemove, onSetup }: PanelCardProps) {
  const [confirm, setConfirm] = useState(confirmRemove);
  useEffect(() => setConfirm(confirmRemove), [confirmRemove]);
  const found = useFound(`panel-${entry.id}`);
  const status = view.panels.find((p) => !p.is_virtual && p.id === entry.id)?.status;
  const connectedPort = status?.status === "Connected" ? status.port : null;
  const state = panelState({ enabled: view.enabled, entry, status, screens });
  const display = displayOfPanel(displays, entry);
  const online = display?.online === true;
  const pin = linkPin(display);
  // An error is said as the kiosk says it; a missing touchscreen is already the status line.
  const trouble = status?.status === "Error" ? statusText(status, entry.name) : null;
  const url = panelKioskUrl(port, entry.id);
  const set = (key: string, value: Json) => void setKey(`panels.${index}.${key}`, value);
  const ready = state === "ready" && online;
  return (
    <div ref={found.ref} className={cn("rounded-xl", found.className)}>
      <Card>
        <div className="flex flex-wrap items-center gap-3 px-[18px] py-3.5">
          <div className="flex min-w-40 flex-1 flex-col gap-[3px]">
            <span className="text-lead font-medium">{entry.name}</span>
            <span className={cn("text-caption", LINE_TONE[state === "ready" && !online ? "not-paired" : state])}>{panelLine(state, entry, online)}</span>
            {trouble && <span className="text-caption text-s-muted">{trouble}</span>}
          </div>
          {!ready && (
            <Button kind="accent" onClick={onSetup}>
              Continue setup…
            </Button>
          )}
          {confirm ? (
            <>
              <Button onClick={() => setConfirm(false)}>Keep</Button>
              <Button kind="danger" onClick={onRemove}>
                Remove {entry.name}
              </Button>
            </>
          ) : (
            <Button kind="quiet" onClick={() => setConfirm(true)} title="Remove this panel">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        <Row
          label="Shows"
          hint={
            pin
              ? `Pinned by its link to ${dashboardScreens.find((s) => s.id === pin)?.name ?? "a screen"}: its InfoPanel URL has &profile= in it. Take that out to choose here.`
              : display
                ? "The screen on the panel. The same choice as its card on Screens, and the screen's own Use on touch panel."
                : "Choose once InfoPanel shows its kiosk (below)."
          }
        >
          <select
            aria-label={`Screen for ${entry.name}`}
            disabled={!display}
            value={display?.screen ?? DISPLAY_FOLLOW}
            onChange={(e) => display && void postControl("display", { action: "assign", display: display.name, screen: e.target.value })}
            className="h-[30px] max-w-full cursor-pointer rounded-lg border border-s-input-line bg-s-input px-2.5 text-caption text-s-t1 disabled:cursor-default disabled:opacity-50"
          >
            <option value={DISPLAY_FOLLOW}>Follow the default screen</option>
            {dashboardScreens.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Row>
        <details open={!online} className="group px-[18px] py-3.5">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-body font-medium">
            <ChevronRight className="h-4 w-4 text-s-dim transition-transform group-open:rotate-90" />
            Show this on the panel's display
          </summary>
          <div className="flex flex-col gap-2.5 pt-2.5">
            <span className="text-caption leading-[1.45] text-s-muted">Once, in InfoPanel. The address stays the same; which screen it shows is chosen above.</span>
            <ShowSteps url={url} />
          </div>
        </details>
        <Row
          label="Fix touches"
          hint={
            entry.panel.calibration
              ? "Calibrated. Pair if the wrong screen reacts; calibrate again if touches land beside your finger."
              : "Only if something is off. Pair if the wrong screen reacts: you touch the screen that asks. Calibrate if touches land beside your finger."
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
              disabled={steps.running !== null || connectedPort === null}
              title={connectedPort === null ? "Its touchscreen isn't connected" : undefined}
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
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-[18px] py-3.5 text-body font-medium">
            <ChevronRight className="h-4 w-4 text-s-dim transition-transform group-open:rotate-90" />
            Advanced
          </summary>
          <div className="divide-y divide-s-divider border-t border-s-divider">
            <Row label="Name" hint="What its screen shows when you identify it or pair it.">
              <Field label="Name" value={entry.name} width="w-44" onCommit={(v) => set("name", v.trim() || null)} />
            </Row>
            <Row label="Id" hint="Part of its address in InfoPanel. Change it and you change that address too.">
              <Field label="Id" value={entry.id} width="w-44" onCommit={(v) => set("id", v.trim())} />
            </Row>
            <Row label="Size" hint={entry.monitor ? "Taken from its display when it was paired. The kiosk page must fill exactly this." : "The panel's resolution in pixels. Pairing fills it in from its display."}>
              <span className="flex items-center gap-2">
                <Field label="Width" numeric value={entry.panel.width_px} width="w-24" onCommit={(v) => set("panel.width_px", Number(v))} />
                <span className="text-s-dim">×</span>
                <Field label="Height" numeric value={entry.panel.height_px} width="w-24" unit="px" onCommit={(v) => set("panel.height_px", Number(v))} />
              </span>
            </Row>
            <Row label="Rotation" hint="Mounted sideways? Turn touches to match, clockwise.">
              <Segmented size="sm" label="Rotation" options={[...ROTATIONS]} value={entry.panel.rotation} onChange={(v) => set("panel.rotation", v)} />
            </Row>
            <SwitchRow label="Mirror horizontally" hint="Touches land on the wrong side? Flip them left to right." checked={entry.panel.flip_x} onChange={(v) => set("panel.flip_x", v)} />
            <SwitchRow label="Mirror vertically" hint="Touches land upside down? Flip them top to bottom." checked={entry.panel.flip_y} onChange={(v) => set("panel.flip_y", v)} />
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
                connectedPort && <Button onClick={() => set("device.port", connectedPort)}>Pin to {shortPort(connectedPort)}</Button>
              )}
            </Row>
          </div>
        </details>
      </Card>
    </div>
  );
}
