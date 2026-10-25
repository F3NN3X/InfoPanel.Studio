import { useEffect, useState, type ReactNode } from "react";
import { Monitor } from "lucide-react";
import type { HistorySetter } from "@/hooks/use-config-history";
import { Toggle } from "@/components/ui/toggle";
import type { ControlKiosk } from "@/lib/control";
import { resolveGeneral } from "@/lib/general";
import { valueText } from "@/lib/inheritance";
import type { DashboardConfig, MonitorProfile, PageRotate, ProfileView } from "@/lib/layout";
import type { PerformanceOverride } from "@/lib/performance";
import { cn } from "@/lib/utils";
import { FPS_OPTIONS, MOTION_OPTIONS, ROTATE_DEFAULT_SECONDS, ROTATE_MAX_SECONDS, ROTATE_MIN_SECONDS, clampSeconds } from "./inspector/behaviour-model";
import { InheritChip } from "./inherit-chip";
import { LinkRow } from "./link-row";
import { ShownOn } from "./screens/shown-on";
import { GridSection, SizeFitSection } from "./screen-layout";
import { ScreenPages } from "./screen-pages";
import { screenMeta } from "./screens-model";
import { FIELD, InlineRow, SegmentedRow } from "./setting-rows";
import type { NavTarget } from "./studio-nav";
import { ownCount } from "./theme-cards";
import { inheritanceApi } from "./use-inheritance";

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
  /** Write the screen's own frame rate or animations (customising it first). */
  onPerformance: (patch: PerformanceOverride) => void;
  onMovePage: (id: string, toIndex: number) => void;
  onAddPage: () => void;
  onOpenPage: (pageId: string) => void;
  /** The Live popover ("Pause it for now from Live ↗"). */
  onOpenLive: () => void;
  navigateTo: (target: NavTarget) => void;
  /** The kiosks connected now (Shown on). */
  kiosks: readonly ControlKiosk[];
  /** The screen "Best fit" resolves to for the studio window. */
  autoProfileId: string;
  /** Open the screen in Design, or in the InfoPanel editor when it is one InfoPanel profile. */
  onOpenScreen: (id: string) => void;
}

const LABEL = "font-ui-mono text-[10px] tracking-[0.06em] text-[#7c7c86]";

/** A group of the detail panel: a mono caption (and what sits at its end), then its rows. */
function Group({ id, label, end, children }: { id: string; label: string; end?: ReactNode; children: ReactNode }) {
  return (
    <section data-nav-section={id} className="flex flex-col gap-2 border-b border-ui-subtle px-3.5 py-3">
      <div className="flex min-h-5 items-center gap-2">
        <h3 className={cn(LABEL, "flex-1")}>{label}</h3>
        {end}
      </div>
      {children}
    </section>
  );
}

/** Seconds between pages: a draft that commits on Enter or blur, clamped to 3–3600. */
function SecondsInput({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = clampSeconds(draft);
    if (n === null) return setDraft(String(value));
    setDraft(String(n));
    if (n !== value) onCommit(n);
  };
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
      className={cn(FIELD, "h-[26px] w-[64px] shrink-0 px-1.5 text-right font-ui-mono text-[11.5px]")}
    />
  );
}

/**
 * The right panel of Screens (SPEC §8) for the screen being edited: SIZE & FIT, GRID, ROTATION, PERFORMANCE (the
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
  autoProfileId,
  onOpenScreen,
}: ScreenDetailProps) {
  const rotate = stored.rotate;
  const general = resolveGeneral(config);
  const inherit = inheritanceApi("performance", { level: "screen", profileId: stored.id }, { config, setConfig, navigateTo });
  const fps = stored.performance?.maxFps ?? general.maxFps;
  const motion = stored.performance?.motion ?? general.motion;
  const look = ownCount(config, { level: "screen", profileId: stored.id });
  return (
    <aside aria-label="Screen details" className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-l border-ui-subtle bg-ui-panel max-[899px]:w-full max-[899px]:overflow-visible max-[899px]:border-l-0 max-[899px]:border-t">
      <div className="flex items-center gap-2 border-b border-ui-subtle p-3.5">
        <Monitor className="h-[18px] w-[18px] shrink-0 text-ui-3" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-ui-1">{stored.name}</div>
          <div className="truncate font-ui-mono text-[10.5px] text-ui-4">{screenMeta(stored)}</div>
        </div>
        <button
          type="button"
          onClick={() => onOpenScreen(stored.id)}
          className="inline-flex h-7 shrink-0 items-center rounded-[7px] bg-ui-1 px-3 text-[12px] font-semibold text-ui-inverse-fg hover:opacity-90"
        >
          Open
        </button>
      </div>

      <Group id="shown" label="SHOWN ON">
        <ShownOn
          screenId={stored.id}
          isDefault={config.activeProfile === stored.id}
          isBestFit={config.activeProfile === "auto" && autoProfileId === stored.id}
          kiosks={kiosks}
          onChangeDefault={() => navigateTo({ view: "settings", tab: "dashboard", section: "startup" })}
        />
      </Group>

      <Group id="size" label="SIZE & FIT">
        <SizeFitSection profile={profile} updateProfile={updateProfile} windowSize={windowSize} />
      </Group>

      <Group id="grid" label="GRID">
        <GridSection
          profile={profile}
          updateProfile={updateProfile}
          otherZones={stored.pages.filter((pg) => pg.id !== profile.pageId).flatMap((pg) => pg.placements)}
        />
      </Group>

      <Group id="rotation" label="ROTATION">
        <InlineRow label="Rotate pages">
          <Toggle checked={rotate?.enabled ?? false} onChange={(enabled) => onRotate({ enabled })} label="Rotate pages" className="[&>span]:bg-ui-1" />
        </InlineRow>
        <InlineRow label="Every" hint="Seconds between pages, 3 to 3600. A touch or a remote page switch pauses it for 30 s.">
          <SecondsInput value={rotate?.seconds ?? ROTATE_DEFAULT_SECONDS} onCommit={(seconds) => onRotate({ seconds })} />
        </InlineRow>
        <LinkRow note="Pause it for now from" link="Live" onNavigate={onOpenLive} />
      </Group>

      <Group
        id="performance"
        label="PERFORMANCE"
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
            value={String(fps)}
            onChange={(v) => onPerformance({ maxFps: Number(v) })}
          />
        </div>
        <SegmentedRow
          label="Animations"
          hint="Reduced disables animations: a background video shows its poster, meters and waveforms are calm. Follow system uses the operating system's setting."
          options={MOTION_OPTIONS}
          value={motion}
          onChange={(v) => onPerformance({ motion: v as NonNullable<PerformanceOverride["motion"]> })}
        />
      </Group>

      <Group id="linked" label="LINKED — EDITED ELSEWHERE">
        <LinkRow
          label="Look"
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
        label="PAGES · ORDER & ROTATION"
        end={
          <button type="button" onClick={onAddPage} className="rounded-sm text-[11.5px] text-ui-accent-text hover:underline">
            + Add page
          </button>
        }
      >
        <ScreenPages pages={stored.pages} rotate={rotate} onMove={onMovePage} onRotate={onRotate} onOpen={onOpenPage} />
      </Group>
    </aside>
  );
}
