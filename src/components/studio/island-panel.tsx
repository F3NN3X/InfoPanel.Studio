import { useMemo } from "react";
import { Bell, Blocks } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import type { HistorySetter } from "@/hooks/use-config-history";
import { withIsland, type IslandConfig } from "@/lib/island/config";
import { ISLAND_SETTING } from "@/lib/island/sources";
import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { modules } from "@/modules";
import { SeverityDot } from "./alerts-fields";
import { alertsOf } from "./alerts-model";
import { IslandSection } from "./inspector/island-section";
import { PanelSection } from "./panel-section";
import { islandRules, islandWidgets, setZoneSetting, unplacedIslandWidgets } from "./island-panel-model";

export interface IslandPanelProps {
  config: DashboardConfig;
  setConfig: HistorySetter;
  /** The profile on the canvas; the island is per profile. */
  profile: MonitorProfile;
  /** Show a zone on the canvas (switching page when it is on another) with its settings. */
  onOpenZone: (pageId: string, zoneId: string) => void;
  /** Open an alert rule in the Alerts drawer (null = the rules list). */
  onOpenRule: (ruleId: string | null) => void;
  /** The sensor picker's "Open data explorer". */
  onOpenExplorer: () => void;
}

/**
 * The Dynamic Island drawer: every notch setting of the profile in one place. The island itself (the
 * same section as Dashboard › Profile), the widgets that can send to it with their "Send to island"
 * switches across every page, and the alert rules that show on it.
 */
export function IslandPanel({ config, setConfig, profile, onOpenZone, onOpenRule, onOpenExplorer }: IslandPanelProps) {
  const island = profile.island;
  const widgets = useMemo(() => islandWidgets(profile, modules), [profile]);
  const unplaced = useMemo(() => unplacedIslandWidgets(profile, modules), [profile]);
  const rules = islandRules(alertsOf(config), profile.id);
  const multiPage = profile.pages.length > 1;

  const patchIsland = (patch: Partial<IslandConfig>) =>
    setConfig(
      (c) => ({ ...c, profiles: c.profiles.map((p) => (p.id === profile.id ? withIsland(p, patch) : p)) }),
      "profile:island"
    );

  return (
    <>
      <div className="shrink-0 px-3.5 pb-2.5 pt-3.5">
        <div className="text-[13px] font-semibold text-ui-1">Dynamic Island</div>
        <div className="truncate text-[11px] text-ui-4" title={profile.name}>
          {profile.name}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <IslandSection island={island} onChange={patchIsland} onOpenExplorer={onOpenExplorer} sections />

        {island?.enabled && (
          <>
            <PanelSection id="island-widgets" title="Widgets" icon={Blocks} pad={false}>
              <div className="space-y-1.5 px-2 py-1">
                {widgets.length === 0 ? (
                  <p className="px-2 text-pretty text-[12px] leading-[1.45] text-ui-4">
                    No widget on this profile can send to the island yet.
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {widgets.map((w) => (
                      <li key={w.zoneId} className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-ui-hover">
                        <Toggle
                          checked={w.on}
                          label={`${w.title} sends to the island`}
                          onChange={(on) =>
                            setConfig((c) => setZoneSetting(c, profile.id, w.zoneId, ISLAND_SETTING, on), `island-widget:${w.zoneId}`)
                          }
                        />
                        <button
                          type="button"
                          onClick={() => onOpenZone(w.pageId, w.zoneId)}
                          title="Show it on the canvas and open its settings"
                          className={cn(
                            "min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60",
                            (!w.on || !w.visible || w.shadowed) && "opacity-55"
                          )}
                        >
                          <span className="block truncate text-[12.5px] text-ui-1">{w.title}</span>
                          {(multiPage || !w.visible || w.shadowed) && (
                            <span className="block truncate text-[11px] text-ui-4">
                              {[
                                multiPage && w.pageName,
                                !w.visible && "Hidden, sends nothing",
                                w.shadowed && "Another one sends first",
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {unplaced.length > 0 && (
                  <p className="px-2 text-pretty text-[11px] leading-snug text-ui-5">
                    Add one of these to send more: {unplaced.join(", ")}.
                  </p>
                )}
              </div>
            </PanelSection>

            <PanelSection id="island-rules" title="Alert rules" icon={Bell} pad={false}>
              <div className="px-2 py-1">
                {rules.length === 0 ? (
                  <p className="px-2 py-1 text-pretty text-[12px] leading-[1.45] text-ui-4">
                    No alert rule shows here. Pick Island as a rule’s display style in{" "}
                    <button type="button" onClick={() => onOpenRule(null)} className="text-ui-accent underline-offset-2 hover:underline">
                      Alerts
                    </button>
                    .
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {rules.map((rule) => (
                      <li key={rule.id}>
                        <button
                          type="button"
                          onClick={() => onOpenRule(rule.id)}
                          className={cn(
                            "flex w-full items-center gap-1.5 rounded-lg p-1.5 text-left hover:bg-ui-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60",
                            !rule.enabled && "opacity-55"
                          )}
                        >
                          <SeverityDot severity={rule.severity} />
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ui-1">{rule.name}</span>
                          {!rule.enabled && <span className="shrink-0 text-[11px] text-ui-4">Off</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </PanelSection>
          </>
        )}
      </div>
    </>
  );
}
