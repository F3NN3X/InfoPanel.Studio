import { useState } from "react";
import { Crosshair, Hand, Moon, PanelTop, RefreshCw, RotateCw, ScanEye, Settings2, Sun, Monitor, Trash2, X } from "lucide-react";
import { DISPLAY_FOLLOW, postControl, type ControlState } from "@/lib/control";
import { openSettings } from "@/lib/desktop";
import type { MonitorProfile } from "@/lib/layout";
import { leaveTouchIntent, type TouchIntent } from "@/lib/touch/intent";
import { PANEL_STATE_TEXT, panelState, type PanelState } from "@/lib/touch/panels";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { liveActions } from "../live-model";
import { selectedLabel } from "../selected-label";
import { CardMenu, type CardAction } from "./card-actions";
import { displaySubtitle, displayTitle, offersTouch, pinnedScreen, rotationButton, type DisplayEntry } from "./display-model";
import { aspectOf, previewBox } from "./profile-card";
import { ScreenThumb } from "./screen-thumb";
import type { TouchPanels } from "./use-touch-panels";

/** The two selects of a card's switcher share one bordered box: `Perf heavy / Main`. */
const SELECT = cn("h-8 min-w-0 cursor-pointer bg-transparent px-2 text-body text-ui-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-accent");

const SMALL_BUTTON = cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-ui-md border border-ui-strong px-2.5 text-caption text-ui-1 hover:bg-ui-hover", FOCUS_RING);

/** A dim level the card's menu switches to; the Live popover's slider takes any step. */
const DIM_LEVEL = 0.5;

const TOUCH_TONE: Record<PanelState, string> = {
  off: "text-ui-3",
  "needs-driver": "text-ui-warn",
  "not-paired": "text-ui-warn",
  "not-connected": "text-ui-danger",
  ready: "text-ui-ok",
};

interface DisplayCardProps {
  entry: DisplayEntry;
  profiles: readonly MonitorProfile[];
  control: ControlState | null;
  touch: TouchPanels;
  now: number;
  /** Lit for a moment after a screen's "On 1 display" led here. */
  highlighted?: boolean;
  /** Open the screen's settings on its Rotation group. */
  onRotationSettings: (screenId: string) => void;
}

/**
 * One display (Q9), online or not: a preview of the screen it shows, what it shows (screen and page), its page cycling,
 * its touch panel and a menu. The page and the cycling belong to the screen, so they act on every display showing it;
 * the screen can be chosen here only for a named display, which is the one the server lets the studio assign.
 */
export function DisplayCard({ entry, profiles, control, touch, now, highlighted, onRotationSettings }: DisplayCardProps) {
  const { kiosk, display, screen, online } = entry;
  const title = displayTitle(entry);
  const state = screen ? control?.profiles[screen.id] : undefined;
  const rotation = screen ? rotationButton(screen, state) : undefined;
  const dimmed = (state?.dim ?? 0) > 0;
  const island = state?.island ?? screen?.island?.enabled === true;
  const page = screen ? (screen.pages.find((p) => p.id === (kiosk?.page ?? state?.page))?.id ?? screen.pages[0]?.id) : undefined;
  const previewPage = screen?.pages.find((p) => p.id === page);
  const pinnedTo = pinnedScreen(display, profiles);

  const actions: CardAction[] = [
    ...(screen && online
      ? [
          { id: "rotation", label: `${screen.name} rotation settings…`, icon: Settings2, run: () => onRotationSettings(screen.id) },
          { id: "dim", label: dimmed ? `Stop dimming ${screen.name}` : `Dim ${screen.name}`, icon: dimmed ? Sun : Moon, run: () => void liveActions.setDim(screen.id, dimmed ? 0 : DIM_LEVEL) },
          {
            id: "island",
            label: island ? `Hide Dynamic Island on ${screen.name}` : `Show Dynamic Island on ${screen.name}`,
            icon: PanelTop,
            run: () => void liveActions.setIsland(screen.id, !island, screen.island?.enabled === true),
          },
          { id: "reload-screen", label: `Reload displays showing ${screen.name}`, icon: RefreshCw, run: () => void postControl("kiosk", { action: "reload", profile: screen.id }) },
        ]
      : []),
    ...(online ? [{ id: "reload-all", label: "Reload all kiosks", icon: RefreshCw, run: () => void liveActions.reload() }] : []),
    ...(display ? [{ id: "forget", label: "Forget display", icon: X, run: () => void postControl("display", { action: "forget", display: display.name }), danger: true }] : []),
  ];

  return (
    <li
      data-display={entry.key}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-ui-lg border bg-ui-panel transition-colors duration-(--ui-dur-fast)",
        highlighted ? "border-ui-accent" : "border-ui-default",
      )}
    >
      <div className={cn("relative grid h-[150px] place-items-center border-b border-ui-subtle bg-ui-chrome p-3.5", !online && "opacity-60")}>
        <StatusChip tone={online ? "ok" : "neutral"} className="absolute left-2.5 top-2.5 z-10 h-5 bg-ui-panel/80 text-micro">
          {online ? "Live" : "Offline"}
        </StatusChip>
        {screen ? (
          <div title={`${screen.name}, page ${previewPage?.name ?? ""}`} className="overflow-hidden rounded-ui-sm border border-ui-strong bg-s-well" style={previewBox(aspectOf(screen.width, screen.height))}>
            <ScreenThumb profile={screen} pageId={page} still />
          </div>
        ) : (
          <Monitor className="h-8 w-8 text-ui-hint" strokeWidth={1.5} aria-hidden />
        )}
      </div>
      <div className="flex flex-col gap-2.5 p-3">
        <div className="flex min-w-0 items-center gap-2">
          {entry.panel ? <Hand className="h-4 w-4 shrink-0 text-ui-hint" strokeWidth={1.5} aria-hidden /> : <Monitor className="h-4 w-4 shrink-0 text-ui-hint" strokeWidth={1.5} aria-hidden />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-body font-medium text-ui-1">{title}</div>
            <div className="truncate font-ui-mono text-micro text-ui-3">{displaySubtitle(entry, now)}</div>
          </div>
          {actions.length > 0 && <CardMenu actions={actions} label={`Display actions, ${title}`} />}
        </div>
        <Shows entry={entry} title={title} profiles={profiles} page={page} />
        {pinnedTo && (
          <p className="text-micro text-ui-3" title={`This display's link pins it to ${pinnedTo.name}; the choice applies once the link no longer pins.`}>
            Pinned by its link to {pinnedTo.name}
          </p>
        )}
        {screen && online && rotation && (
          <button
            type="button"
            title={rotation.title}
            aria-label={`${rotation.label} (${screen.name})`}
            aria-pressed={rotation.toggles ? rotation.running : undefined}
            disabled={!rotation.toggles || control === null}
            onClick={() => void liveActions.setRotation(screen.id, !rotation.running, screen.rotate?.enabled === true)}
            className={cn("inline-flex h-7 items-center gap-1.5 self-start rounded-ui-md px-1.5 text-caption text-ui-2 hover:bg-ui-raised hover:text-ui-1 disabled:pointer-events-none disabled:opacity-60", FOCUS_RING)}
          >
            <RotateCw className={cn("h-3.5 w-3.5", !rotation.running && "opacity-60")} strokeWidth={1.5} aria-hidden />
            {rotation.label}
          </button>
        )}
        {offersTouch(entry) && <TouchRow entry={entry} title={title} touch={touch} />}
      </div>
    </li>
  );
}

/** "Shows: [screen ▾] / [page ▾]": the screen for a named display, the page of the screen for a live one. */
function Shows({ entry, title, profiles, page }: { entry: DisplayEntry; title: string; profiles: readonly MonitorProfile[]; page: string | undefined }) {
  const { display, screen, online } = entry;
  if (!display && !screen) return <p className="text-caption text-ui-3">This kiosk shows a screen that no longer exists</p>;
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-caption text-ui-3">Shows</span>
      <div className="flex min-w-0 flex-1 items-center rounded-ui-md border border-ui-control bg-ui-chrome">
        {display ? (
          <select
            aria-label={`Screen for ${title}`}
            value={display.screen}
            onChange={(e) => void postControl("display", { action: "assign", display: display.name, screen: e.target.value })}
            title={selectedLabel([{ value: DISPLAY_FOLLOW, label: "Follow default" }, ...profiles.map((p) => ({ value: p.id, label: p.name }))], display.screen)}
            className={cn(SELECT, "max-w-[55%] flex-1")}
          >
            <option value={DISPLAY_FOLLOW}>Follow default</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <span title="This kiosk's link pins its screen. Open the link with a display name to switch screens from here." className="max-w-[55%] flex-1 truncate px-2 text-body text-ui-1">
            {screen?.name}
          </span>
        )}
        {screen && online && (
          <>
            <span aria-hidden className="text-ui-hint">
              /
            </span>
            <select aria-label={`Page of ${screen.name}`} value={page ?? ""} onChange={(e) => void liveActions.showPage(screen.id, e.target.value)} title={selectedLabel(screen.pages.map((p) => ({ value: p.id, label: p.name })), page ?? "")} className={cn(SELECT, "flex-1 text-ui-2")}>
              {screen.pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
    </div>
  );
}

/** Opens Settings › Touch on a step for this display's panel: every touch change is made there. */
function touchStep(intent: TouchIntent) {
  leaveTouchIntent(intent);
  void openSettings(`touch/${intent.action}`);
}

/**
 * The card's touch row: where its touch panel stands, and Set up touch (the guided setup in Settings › Touch, for its
 * panel or a new one named after the display). A ready panel has Identify, Calibrate… and Remove in its menu. A browser
 * studio says touch needs the desktop app.
 */
function TouchRow({ entry, title, touch }: { entry: DisplayEntry; title: string; touch: TouchPanels }) {
  const [why, setWhy] = useState(false);
  const { panel } = entry;
  if (!touch.desktop) {
    return (
      <div className="flex flex-col gap-1.5 border-t border-ui-subtle pt-2.5">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-caption text-ui-3">Touch</span>
          <span className="flex-1 text-caption text-ui-3">Off</span>
          <button type="button" aria-expanded={why} onClick={() => setWhy(!why)} className={SMALL_BUTTON}>
            Set up touch
          </button>
        </div>
        {why && <p className="text-pretty text-micro leading-[1.4] text-ui-3">Touch panels need the InfoPanel Studio desktop app: it reads the touchscreen over USB. Set up touch from the Studio window of the desktop app.</p>}
      </div>
    );
  }
  const index = panel ? (touch.view?.effective.panels.findIndex((p) => p.id === panel.id) ?? -1) : -1;
  const status = panel ? touch.view?.panels.find((p) => !p.is_virtual && p.id === panel.id)?.status : undefined;
  const state = panelState({ enabled: touch.view?.enabled ?? false, entry: index >= 0 ? panel : undefined, status, screens: touch.screens });
  const setup = () => touchStep(panel ? { action: "setup", panel: panel.id } : { action: "setup", display: entry.display?.name });
  const panelActions: CardAction[] = panel
    ? [
        { id: "identify", label: "Identify", icon: ScanEye, run: () => touchStep({ action: "identify", panel: panel.id }) },
        { id: "calibrate", label: "Calibrate…", icon: Crosshair, run: () => touchStep({ action: "calibrate", panel: panel.id }) },
        { id: "remove", label: "Remove…", icon: Trash2, run: () => touchStep({ action: "remove", panel: panel.id }), danger: true },
      ]
    : [];
  return (
    <div className="flex items-center gap-2 border-t border-ui-subtle pt-2.5">
      <span className="shrink-0 text-caption text-ui-3">Touch</span>
      <span className={cn("flex-1 truncate text-caption", TOUCH_TONE[state])}>{PANEL_STATE_TEXT[state]}</span>
      {state === "ready" ? (
        <CardMenu actions={panelActions} label={`Touch panel actions, ${title}`} />
      ) : (
        <button type="button" onClick={setup} className={SMALL_BUTTON}>
          Set up touch
        </button>
      )}
    </div>
  );
}
