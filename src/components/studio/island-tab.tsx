import { useMemo, useState } from "react";
import type { HistorySetter } from "@/hooks/use-config-history";
import { resolveFont, resolveGeneral } from "@/lib/general";
import { createIslandBus } from "@/lib/island/bus";
import { withIsland, type IslandConfig } from "@/lib/island/config";
import { withIslandLook } from "@/lib/island/looks";
import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { modules } from "@/modules";
import { alertsOf } from "./alerts-model";
import { IslandSection } from "./inspector/island-section";
import { IslandPreview } from "./island-preview";
import {
  FOLLOW_DASHBOARD,
  FOLLOW_THEME,
  islandClockLink,
  islandFontLink,
  islandRules,
  islandWidgets,
  unplacedIslandWidgets,
  type IslandLink,
} from "./island-panel-model";
import { LinkRow } from "./link-row";
import type { NavTarget } from "./studio-nav";

export interface IslandTabProps {
  config: DashboardConfig;
  setConfig: HistorySetter;
  /** The screen on the canvas: the one the chips start on (the island is per screen). */
  current: MonitorProfile;
  /** Show a widget on the canvas (its screen and page) and open its Behaviour tab. */
  onOpenZone: (profileId: string, pageId: string, zoneId: string) => void;
  /** The sensor picker's "Open data explorer". */
  onOpenExplorer: () => void;
  navigateTo: (target: NavTarget) => void;
}

const FOLLOW = "rounded-sm text-[11px] text-ui-accent-text hover:underline";

/** A read-only island row (Font, Clock format) with its `↗` link; an island's own older value can be handed back. */
function IslandLinkRow({ label, link, linkText, onNavigate, followText, onFollow }: {
  label: string;
  link: IslandLink;
  linkText: string;
  onNavigate: () => void;
  followText: string;
  onFollow: () => void;
}) {
  return (
    <div>
      <LinkRow label={label} value={link.value} from={link.from} link={linkText} onNavigate={onNavigate} />
      {link.own && (
        <button type="button" onClick={onFollow} className={FOLLOW}>
          {followText}
        </button>
      )}
    </div>
  );
}

/**
 * Alerts & Island › Island (SPEC §10.3): the screen chips, the live preview, the island's rows (Font and
 * Clock format are links to Theme and Settings), the dashboard notices, the widgets that send to it
 * and a link to the rules that show on it.
 */
export function IslandTab({ config, setConfig, current, onOpenZone, onOpenExplorer, navigateTo }: IslandTabProps) {
  const [pickedId, setPickedId] = useState(current.id);
  const [previewBus] = useState(() => createIslandBus());
  const profile = config.profiles.find((p) => p.id === pickedId) ?? current;
  const island = profile.island;
  const widgets = useMemo(() => islandWidgets(profile, modules).filter((w) => w.on), [profile]);
  const unplaced = useMemo(() => unplacedIslandWidgets(profile, modules), [profile]);
  const rules = islandRules(alertsOf(config), profile.id);
  const general = resolveGeneral(config, profile);
  const multiPage = profile.pages.length > 1;

  const patchIsland = (patch: Partial<IslandConfig>) =>
    setConfig((c) => ({ ...c, profiles: c.profiles.map((p) => (p.id === profile.id ? withIsland(p, patch) : p)) }), "profile:island");

  const font = islandFontLink(island, resolveFont(profile));
  const clock = islandClockLink(island, general);

  return (
    <IslandSection
      island={island}
      previewBus={previewBus}
      onChange={patchIsland}
      onLook={(look) => setConfig((c) => withIslandLook(c, look, profile.id))}
      onOpenExplorer={onOpenExplorer}
      links={{
        font: (
          <IslandLinkRow
            label="Font"
            link={font}
            linkText="Theme"
            onNavigate={() => navigateTo({ view: "theme", themeScope: { kind: "profile" }, profileId: profile.id, section: "type" })}
            followText="Follow Theme"
            onFollow={() => patchIsland(FOLLOW_THEME)}
          />
        ),
        clock: (
          <IslandLinkRow
            label="Clock format"
            link={clock}
            linkText="Settings"
            onNavigate={() => navigateTo({ view: "settings", tab: "dashboard", section: "clock" })}
            followText="Follow the Dashboard"
            onFollow={() => patchIsland(FOLLOW_DASHBOARD)}
          />
        ),
      }}
      lead={
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px] text-ui-4">Island for</span>
            {config.profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={p.id === profile.id}
                onClick={() => setPickedId(p.id)}
                className={cn(
                  "h-[26px] rounded-md border px-2.5 text-[12px] text-ui-2 hover:border-ui-strong",
                  p.id === profile.id ? "border-[#3a3a44] bg-[#26262c] text-ui-1" : "border-ui-default"
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
          <IslandPreview island={island} page={{ width: profile.width, height: profile.height }} bus={previewBus} />
        </>
      }
      aside={
        <>
          <div className="flex flex-col gap-2 rounded-[10px] border border-ui-default p-3.5">
            <div className="font-ui-mono text-[10px] font-medium uppercase tracking-[.06em] text-ui-4">Widgets sent to the island</div>
            {widgets.length === 0 ? (
              <p className="text-pretty text-[12px] leading-[1.45] text-ui-4">No widget on this screen sends to the island yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {widgets.map((w) => (
                  <li key={w.zoneId} className={cn("flex items-center gap-2", (!w.visible || w.shadowed) && "opacity-55")}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-ui-1">{w.title}</span>
                      {(multiPage || !w.visible || w.shadowed) && (
                        <span className="block truncate text-[11px] text-ui-4">
                          {[multiPage && w.pageName, !w.visible && "Hidden, sends nothing", w.shadowed && "Another one sends first"].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenZone(profile.id, w.pageId, w.zoneId)}
                      title="Show it on the canvas and open its Behavior tab"
                      className="shrink-0 rounded-sm text-[11.5px] text-ui-accent-text hover:underline"
                    >
                      Open widget ↗
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {unplaced.length > 0 && (
              <p className="text-pretty text-[11px] leading-snug text-ui-hint">Add one of these to send more: {unplaced.join(", ")}.</p>
            )}
            <span className="text-[11px] text-ui-hint">Turn this on per widget: Behavior › Send to island.</span>
          </div>
          <LinkRow
            label="Alert rules"
            value={`${rules.length} ${rules.length === 1 ? "rule shows" : "rules show"} here`}
            link="Rules"
            onNavigate={() => navigateTo({ view: "alerts", tab: "rules" })}
          />
        </>
      }
    />
  );
}
