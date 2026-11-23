import { useEffect, useMemo, useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { Tag } from "@/components/ui/tag";
import type { HistorySetter } from "@/hooks/use-config-history";
import type { AlertRule } from "@/lib/alerts";
import { resolveFont, resolveGeneral } from "@/lib/general";
import { pageSkinOf } from "@/components/island/island-look";
import { appearanceOf } from "@/lib/style-resolve";
import { createIslandBus } from "@/lib/island/bus";
import { withIsland, type IslandConfig } from "@/lib/island/config";
import { withIslandLook } from "@/lib/island/looks";
import type { IslandNotice } from "@/lib/island/types";
import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { modules } from "@/modules";
import { SeverityDot } from "./alerts-fields";
import { alertsOf } from "./alerts-model";
import { shownAs } from "./alerts-rules";
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

const FOLLOW = "rounded-sm text-micro text-ui-accent-text hover:underline";
const CARD = "flex min-w-0 flex-1 flex-col gap-2 rounded-14 border border-ui-default bg-ui-panel p-4";

/** The bus source of the preview's notices: the kiosk never hears them. */
const PREVIEW_SOURCE = "preview";

type PreviewState = "idle" | "alert" | "notice";

const PREVIEW_STATES: { value: PreviewState; label: string }[] = [
  { value: "idle", label: "Idle" },
  { value: "alert", label: "Alert" },
  { value: "notice", label: "Notice" },
];

/** What the preview shows in a state: the first rule that shows here, else a sample. They stay until the state changes. */
function previewNotices(state: PreviewState, rule: AlertRule | undefined): IslandNotice[] {
  if (state === "alert") {
    return [{ source: PREVIEW_SOURCE, id: "alert", severity: rule?.severity ?? "warning", title: rule?.name ?? "GPU temperature high", body: "84 °C", ttl: 0 }];
  }
  return state === "notice" ? [{ source: PREVIEW_SOURCE, id: "notice", severity: "info", title: "Layout updated", ttl: 0 }] : [];
}

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
 * Alerts & Island › Island: the screen chips and the island's rows (Font and Clock format are links to Theme and
 * Settings) beside a large preview, the widgets that send to it and the rules that show on it.
 */
export function IslandTab({ config, setConfig, current, onOpenZone, onOpenExplorer, navigateTo }: IslandTabProps) {
  const [pickedId, setPickedId] = useState(current.id);
  const [previewBus] = useState(() => createIslandBus());
  const [preview, setPreview] = useState<PreviewState>("idle");
  const profile = config.profiles.find((p) => p.id === pickedId) ?? current;
  const island = profile.island;
  const widgets = useMemo(() => islandWidgets(profile, modules).filter((w) => w.on), [profile]);
  const unplaced = useMemo(() => unplacedIslandWidgets(profile, modules), [profile]);
  const alerts = alertsOf(config);
  const rules = islandRules(alerts, profile.id);
  const general = resolveGeneral(config, profile);
  const multiPage = profile.pages.length > 1;
  useEffect(() => previewBus.syncSource(PREVIEW_SOURCE, previewNotices(preview, rules[0])), [previewBus, preview, rules[0]]);

  const patchIsland = (patch: Partial<IslandConfig>) =>
    setConfig((c) => ({ ...c, profiles: c.profiles.map((p) => (p.id === profile.id ? withIsland(p, patch) : p)) }), "profile:island");

  const font = islandFontLink(island, resolveFont(profile));
  const clock = islandClockLink(island, general);

  return (
    <IslandSection
      island={island}
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
            followText="Follow the theme"
            onFollow={() => patchIsland(FOLLOW_THEME)}
          />
        ),
        clock: (
          <IslandLinkRow
            label="Clock format"
            link={clock}
            linkText="Settings"
            onNavigate={() => navigateTo({ view: "settings", tab: "dashboard", section: "clock" })}
            followText="Follow the dashboard"
            onFollow={() => patchIsland(FOLLOW_DASHBOARD)}
          />
        ),
      }}
      lead={
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-ui-3">Island for</span>
          <div role="group" aria-label="Island for" className="flex flex-wrap gap-1.5">
            {config.profiles.map((p) => (
              <Tag key={p.id} selected={p.id === profile.id} onClick={() => setPickedId(p.id)}>
                {p.name}
              </Tag>
            ))}
          </div>
        </div>
      }
      aside={
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lead font-medium text-ui-1">Preview · {profile.name}</h2>
            <Segmented label="Preview" value={preview} options={PREVIEW_STATES} onChange={setPreview} />
          </div>
          <IslandPreview profile={profile} skin={pageSkinOf(appearanceOf(config, profile))} bus={previewBus} />
          <div className="flex flex-wrap gap-4">
            <div className={CARD}>
              <h3 className="text-body font-medium text-ui-1">Widgets sent to the island</h3>
              {widgets.length === 0 ? (
                <p className="text-pretty text-caption leading-[1.45] text-ui-3">No widget on this screen sends to the island yet</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {widgets.map((w) => (
                    <li key={w.zoneId} className={cn("flex items-center gap-2", (!w.visible || w.shadowed) && "opacity-60")}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body text-ui-1">{w.title}</span>
                        {(multiPage || !w.visible || w.shadowed) && (
                          <span className="block truncate text-caption text-ui-3">
                            {[multiPage && w.pageName, !w.visible && "Hidden, sends nothing", w.shadowed && "Another one sends first"].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenZone(profile.id, w.pageId, w.zoneId)}
                        title="Show it on the canvas and open its Behaviour tab"
                        className="shrink-0 rounded-sm text-caption text-ui-accent-text hover:underline"
                      >
                        Open widget ↗
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {unplaced.length > 0 && <p className="text-pretty text-caption leading-snug text-ui-3">Add one of these to send more: {unplaced.join(", ")}</p>}
              <span className="text-caption text-ui-3">Turn this on per widget: Behaviour › Send to island</span>
            </div>
            <div className={CARD}>
              <h3 className="text-body font-medium text-ui-1">Alerts that show here</h3>
              {rules.length === 0 ? (
                <p className="text-pretty text-caption leading-[1.45] text-ui-3">No rule shows on this island yet</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {rules.map((r) => (
                    <li key={r.id} className="flex items-center gap-2">
                      <SeverityDot severity={r.severity} className="h-1.5 w-1.5" />
                      <span className="min-w-0 flex-1 truncate text-body text-ui-1">{r.name}</span>
                      <span className="shrink-0 text-caption capitalize text-ui-3">{shownAs(r, alerts)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <LinkRow label="Alert rules" value={`${rules.length} ${rules.length === 1 ? "rule shows" : "rules show"} here`} link="Alerts" onNavigate={() => navigateTo({ view: "alerts", tab: "rules" })} />
            </div>
          </div>
        </>
      }
    />
  );
}
