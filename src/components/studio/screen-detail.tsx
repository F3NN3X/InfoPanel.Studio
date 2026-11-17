import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, X } from "lucide-react";
import type { HistorySetter } from "@/hooks/use-config-history";
import { IconButton } from "@/components/ui/icon-button";
import { Toggle } from "@/components/ui/toggle";
import type { ControlDisplay, ControlKiosk } from "@/lib/control";
import { resolveGeneral } from "@/lib/general";
import { valueText } from "@/lib/inheritance";
import type { DashboardConfig, MonitorProfile, PageRotate, ProfileView } from "@/lib/layout";
import { isFreePage } from "@/lib/free-pages";
import { IDLE_DIM_MINUTES, type ScreenPerformance } from "@/lib/performance";
import { cn } from "@/lib/utils";
import { FPS_OPTIONS, MOTION_OPTIONS, ROTATE_DEFAULT_SECONDS, ROTATE_MAX_SECONDS, ROTATE_MIN_SECONDS, clampSeconds } from "./inspector/behaviour-model";
import { InheritChip } from "./inherit-chip";
import { LinkRow } from "./link-row";
import { AutoSwitchField } from "./screens/auto-switch-field";
import { ScreenThumb } from "./screens/screen-thumb";
import { ShownOn } from "./screens/shown-on";
import { GridSection, SizeFitSection } from "./screen-layout";
import { ScreenPages } from "./screen-pages";
import { screenMeta } from "./screens-model";
import { FIELD, InlineRow, SegmentedRow, ToggleRow } from "./setting-rows";
import type { NavTarget } from "./studio-nav";
import { ownCount } from "./theme-cards";
import { inheritanceApi } from "./use-inheritance";

const IDLE_DIM_OPTIONS = [{ value: "0", label: "Off" }, ...IDLE_DIM_MINUTES.map((m) => ({ value: String(m), label: `${m} min` }))];

interface ScreenDetailProps {
  config: DashboardConfig;
  /** The screen being edited, on the page the canvas shows. */
  profile: ProfileView;
  stored: MonitorProfile;
  /** The studio window, for "Use this window's size". */
  windowSize: { width: number; height: number };
  updateProfile: (fn: (p: ProfileView) => ProfileView, key?: string) => void;
  setConfig: HistorySetter;
  /** Write the screen's `rotate` option. */
  onRotate: (patch: Partial<PageRotate>) => void;
  /** Write the screen's performance (undefined clears a key back to the default). */
  onPerformance: (patch: ScreenPerformance) => void;
  onMovePage: (id: string, toIndex: number) => void;
  onAddPage: () => void;
  onOpenPage: (pageId: string) => void;
  /** The Live popover ("Pause it for now from Live ↗"). */
  onOpenLive: () => void;
  navigateTo: (target: NavTarget) => void;
  /** The kiosks connected now (Shown on). */
  kiosks: readonly ControlKiosk[];
  /** The named displays (Shown on). */
  displays: readonly ControlDisplay[];
  /** The screen "Best fit" resolves to for the studio window. */
  autoProfileId: string;
  /** Close the drawer this opens in (Screens' "Screen settings"). */
  onClose: () => void;
}

const LABEL = "text-caption font-medium text-ui-2";

/**
 * A group of the detail panel: a mono caption (and what sits at its end), then its rows. A `collapsible` group opens
 * and closes from its caption (`open` is where it starts).
 */
function Group({ id, label, end, collapsible, open = true, children }: { id: string; label: string; end?: ReactNode; collapsible?: boolean; open?: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(open);
  return (
    <section data-nav-section={id} className="flex flex-col gap-2 border-b border-ui-subtle px-3.5 py-3">
      <div className="flex min-h-5 items-center gap-2">
        {collapsible ? (
          <button type="button" aria-expanded={shown} onClick={() => setShown(!shown)} className={cn(LABEL, "flex flex-1 items-center gap-1 rounded-sm text-left hover:text-ui-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent")}>
            <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", shown && "rotate-90")} aria-hidden />
            {label}
          </button>
        ) : (
          <h3 className={cn(LABEL, "flex-1")}>{label}</h3>
        )}
        {end}
      </div>
      {(!collapsible || shown) && children}
    </section>
  );
}

/** Seconds between pages: a draft that commits on Enter or blur, clamped to 3–3600. */
export function SecondsInput({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = clampSeconds(draft);
    if (n === null) return setDraft(String(value));
    setDraft(String(n));
    if (n !== value) onCommit(n);
  };
  // Esc or a click outside closes the drawer with the number still being typed: it is kept, as a blur would.
  const closing = useRef(commit);
  closing.current = commit;
  useEffect(() => () => closing.current(), []);
  return (
    <input
      type="number"
      min={ROTATE_MIN_SECONDS}
      max={ROTATE_MAX_SECONDS}
      step={1}
      value={draft}
      aria-label="Seconds per page"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={cn(FIELD, "h-[26px] w-[64px] shrink-0 px-1.5 text-right font-ui-mono text-micro")}
    />
  );
}

/**
 * The right panel of Screens (SPEC §8) for the screen being edited: SIZE & FIT, GRID, ROTATION, SWITCH WITH THE APP IN
 * FRONT (its auto-switch rules, P4), PERFORMANCE (the
 * chip: this screen's own frame rate and animations, else Settings › Dashboard's), LINKED — EDITED ELSEWHERE, and
 * PAGES · ORDER & ROTATION.
 */
export function ScreenDetail({
  config,
  profile,
  stored,
  windowSize,
  updateProfile,
  setConfig,
  onRotate,
  onPerformance,
  onMovePage,
  onAddPage,
  onOpenPage,
  onOpenLive,
  navigateTo,
  kiosks,
  displays,
  autoProfileId,
  onClose,
}: ScreenDetailProps) {
  const rotate = stored.rotate;
  // The screen's performance with the defaults filled.
  const perf = resolveGeneral(config, stored);
  const inherit = inheritanceApi("performance", { level: "screen", profileId: stored.id }, { config, setConfig, navigateTo });
  const look = ownCount(config, { level: "screen", profileId: stored.id });
  return (
    <aside aria-label="Screen details" className="flex h-full w-full flex-col overflow-y-auto bg-ui-panel">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-ui-subtle bg-ui-panel px-3.5 py-2.5">
        <h2 className="m-0 flex-1 text-body font-medium text-ui-1">Screen settings</h2>
        <IconButton label="Close screen settings" autoFocus onClick={onClose}>
          <X className="h-4 w-4" strokeWidth={1.5} />
        </IconButton>
      </div>
      <div className="flex flex-col gap-2.5 border-b border-ui-subtle p-3.5">
        <div className="aspect-video w-full overflow-hidden rounded-md border border-ui-default bg-s-well">
          <ScreenThumb profile={stored} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-body font-medium text-ui-1">{stored.name}</div>
          <div className="truncate font-ui-mono text-micro text-ui-4">{screenMeta(stored)}</div>
        </div>
      </div>

      <Group id="shown" label="Shown on" collapsible>
        <ShownOn
          screenId={stored.id}
          isDefault={config.activeProfile === stored.id}
          isBestFit={config.activeProfile === "auto" && autoProfileId === stored.id}
          kiosks={kiosks}
          onChangeDefault={() => navigateTo({ view: "settings", tab: "dashboard", section: "startup" })}
          displays={displays}
        />
      </Group>

      <Group id="size" label="Size and fit" collapsible>
        <SizeFitSection
          profile={profile}
          updateProfile={updateProfile}
          windowSize={windowSize}
          onScaleFree={
            stored.pages.some((pg) => isFreePage(stored, pg))
              ? (from) =>
                  void import("@/lib/page-layout").then(({ scaleFreePages }) =>
                    setConfig((c) => ({ ...c, profiles: c.profiles.map((p) => (p.id === stored.id ? scaleFreePages(p, from) : p)) })),
                  )
              : undefined
          }
        />
      </Group>

      <Group id="grid" label="Grid" collapsible open={false}>
        <GridSection
          profile={profile}
          updateProfile={updateProfile}
          otherZones={stored.pages.filter((pg) => pg.id !== profile.pageId).flatMap((pg) => pg.placements)}
        />
      </Group>

      <Group id="rotation" label="Rotation">
        <InlineRow label="Rotate pages">
          <Toggle checked={rotate?.enabled ?? false} onChange={(enabled) => onRotate({ enabled })} label="Rotate pages" className="[&>span]:bg-ui-1" />
        </InlineRow>
        <InlineRow label="Every" hint="Seconds between pages, 3 to 3600. A touch or a remote page switch pauses it for 30 s.">
          <SecondsInput value={rotate?.seconds ?? ROTATE_DEFAULT_SECONDS} onCommit={(seconds) => onRotate({ seconds })} />
        </InlineRow>
        <LinkRow note="Pause it for now from" link="Live" onNavigate={onOpenLive} />
      </Group>

      <Group id="auto-switch" label="Switch with the app in front">
        <AutoSwitchField
          value={stored.autoSwitch}
          onCommit={(autoSwitch) => setConfig((c) => ({ ...c, profiles: c.profiles.map((p) => (p.id === stored.id ? { ...p, autoSwitch } : p)) }), "profile:autoSwitch")}
        />
      </Group>

      <Group
        id="performance"
        label="Performance"
        end={
          <InheritChip
            state={inherit.state}
            from={inherit.from}
            fromName={inherit.fromName}
            parentText={valueText("performance", inherit.parentValue)}
            onReset={inherit.reset}
            onJump={inherit.jump}
            onCustomise={inherit.customise}
          />
        }
      >
        <div data-nav-control="fps">
          <SegmentedRow
            label="Frame-rate cap"
            hint="The most frames a second animations redraw. Lower uses less CPU and GPU; the kiosk URL's &fps= overrides it. Below 60 fps transitions are off and graphs step at the data rate."
            options={FPS_OPTIONS}
            value={String(perf.maxFps)}
            onChange={(v) => onPerformance({ maxFps: v === "60" ? undefined : Number(v) })}
          />
        </div>
        <SegmentedRow
          label="Animations"
          hint="Reduced disables animations: a background video shows its poster, meters and waveforms are calm. Follow system uses the operating system's setting."
          options={MOTION_OPTIONS}
          value={perf.motion}
          onChange={(v) => onPerformance({ motion: v === "system" ? undefined : (v as NonNullable<ScreenPerformance["motion"]>) })}
        />
        <ToggleRow
          label="Ring glides"
          hint="Rings ease to each new reading. Off: they step, which lets the page rest between readings."
          value={perf.ringGlide}
          onChange={(on) => onPerformance({ ringGlide: on ? true : undefined })}
        />
        <ToggleRow
          label="Limit blur"
          hint="Caps widget blur at 12 px. Large blurs cost far more to draw; on a solid background blur is skipped anyway."
          value={perf.blurLimit}
          onChange={(on) => onPerformance({ blurLimit: on ? undefined : false })}
        />
        <ToggleRow
          label="Blur inside widgets"
          hint="Small badges and cards inside a widget blur what's behind them. Off: they keep their tint."
          value={perf.innerBlur}
          onChange={(on) => onPerformance({ innerBlur: on ? true : undefined })}
        />
        <ToggleRow
          label="Live graph glow"
          hint="A graph's glow is a filter redrawn with the line. Off: a static glow drawn under the line."
          value={perf.liveGlow}
          onChange={(on) => onPerformance({ liveGlow: on ? true : undefined })}
        />
        <ToggleRow
          label="Pixel shift"
          hint="Burn-in protection for an always-on panel: a theme pack that needs it moves its page art about 1 px every few minutes, also with Max FPS under 60 or reduced motion. Widgets never move."
          value={perf.pixelShift}
          onChange={(on) => onPerformance({ pixelShift: on ? true : undefined })}
        />
        <SegmentedRow
          label="Idle dim"
          hint="Dims a theme pack's page art after this many minutes without a touch, key or mouse move; widgets stay. A display with no input device dims that long after it loads."
          options={IDLE_DIM_OPTIONS}
          value={String(perf.idleDim)}
          onChange={(v) => onPerformance({ idleDim: v === "0" ? undefined : Number(v) })}
        />
      </Group>

      <Group id="linked" label="Edited elsewhere">
        <LinkRow
          label="Theme"
          value={`${look} own ${look === 1 ? "section" : "sections"}`}
          link="Edit in Theme"
          onNavigate={() => navigateTo({ view: "theme", themeScope: { kind: "profile" }, profileId: stored.id })}
        />
        <LinkRow
          label="Dynamic Island"
          value={stored.island?.enabled ? "On" : "Off"}
          link="Alerts & Island"
          onNavigate={() => navigateTo({ view: "alerts", tab: "island" })}
        />
      </Group>

      <Group
        id="pages"
        label="Pages: order and rotation"
        end={
          <button type="button" onClick={onAddPage} className="rounded-sm text-micro text-ui-accent-text hover:underline">
            + Add page
          </button>
        }
      >
        <ScreenPages pages={stored.pages} rotate={rotate} onMove={onMovePage} onRotate={onRotate} onOpen={onOpenPage} />
      </Group>
    </aside>
  );
}
