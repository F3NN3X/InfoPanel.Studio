import { Toggle } from "@/components/ui/toggle";
import type { AlertDisplayFull, AlertOutputs as Outputs, AlertRule } from "@/lib/alerts";
import type { DashboardConfig } from "@/lib/layout";
import { InlineRow, SelectRow, ToggleRow } from "./setting-rows";
import { placementTitle } from "./studio-modules";

interface AlertOutputsProps {
  rule: AlertRule;
  config: DashboardConfig;
  /** The config's display defaults: what a rule without a style follows. */
  defaults: AlertDisplayFull;
  /** The profile and page on the canvas. */
  current: { profile: string; page: string };
  /** Edit the rule under a history key (one undo step per field burst). */
  edit: (field: string, fn: (rule: AlertRule) => AlertRule) => void;
}

const NO_PAGE = "";
const pageValue = (profile: string, page: string) => `${profile}\n${page}`;

type Highlight = "none" | "sensor" | "chosen";

/** Where and what else: the screens it shows on, switching to a page and highlighting widgets. */
export function AlertOutputs({ rule, config, defaults, current, edit }: AlertOutputsProps) {
  const out = rule.outputs;
  const setOutputs = (field: string, fn: (o: Outputs) => Outputs) => edit(field, (r) => ({ ...r, outputs: fn(r.outputs) }));

  const page = out.page;
  const pageProfile = config.profiles.find((p) => p.id === (page?.profile ?? current.profile)) ?? config.profiles[0];
  // The zones offered for highlighting: the page it switches to, else the one on the canvas.
  const zonePage = pageProfile.pages.find((p) => p.id === (page?.page ?? current.page)) ?? pageProfile.pages[0];
  const zones = out.highlight?.zones ?? [];
  const highlight: Highlight = !out.highlight ? "none" : zones.length > 0 ? "chosen" : "sensor";
  const autoRings = highlight === "none" && rule.severity === "critical" && (out.display?.style ?? defaults.style) === "auto";

  const setPage = (value: string) =>
    setOutputs("page", (o) => {
      const { page: _was, ...rest } = o;
      if (value === NO_PAGE) return rest;
      const [profile, pageId] = value.split("\n");
      const returnAfter = page === undefined || page.returnAfter === true;
      return { ...rest, page: { profile, page: pageId, ...(returnAfter ? { returnAfter: true } : {}) } };
    });
  const setHighlight = (next: Highlight) =>
    setOutputs("highlight", (o) => {
      const { highlight: _was, ...rest } = o;
      if (next === "none") return rest;
      return { ...rest, highlight: next === "chosen" ? { zones: zonePage.placements.slice(0, 1).map((p) => p.id) } : {} };
    });

  return (
    <section className="flex flex-col rounded-14 border border-ui-default bg-ui-panel px-4 py-3" aria-label="Where and what else">
      <h3 className="pb-1 text-body font-medium text-ui-1">Where and what else</h3>
      <div className="flex flex-col divide-y divide-ui-row [&>*]:min-h-10">
        <div className="flex flex-col justify-center gap-1 py-1">
          <InlineRow label="Screens">
            <span className="text-body text-ui-2">All screens</span>
            <Toggle
              checked={rule.profiles === undefined}
              label="All screens"
              onChange={(on) =>
                edit("profiles", (r) => {
                  const { profiles: _was, ...rest } = r;
                  return on ? rest : { ...rest, profiles: config.profiles.map((p) => p.id) };
                })
              }
            />
          </InlineRow>
          {rule.profiles !== undefined &&
            config.profiles.map((p) => (
              <label key={p.id} className="flex items-center gap-2 pl-1 text-body text-ui-2">
                <input
                  type="checkbox"
                  checked={rule.profiles?.includes(p.id) ?? false}
                  onChange={(e) =>
                    edit("profiles", (r) => {
                      const list = r.profiles ?? [];
                      const next = e.target.checked ? [...list, p.id] : list.filter((id) => id !== p.id);
                      // Unticking the last one would mean "all": keep at least this one.
                      return next.length === 0 ? r : { ...r, profiles: next };
                    })
                  }
                />
                {p.name}
              </label>
            ))}
        </div>
        <SelectRow
          label="Switch to page"
          value={page ? pageValue(pageProfile.id, zonePage.id) : NO_PAGE}
          onChange={setPage}
          options={[
            { value: NO_PAGE, label: "Don't switch" },
            ...config.profiles.flatMap((p) => p.pages.map((pg) => ({ value: pageValue(p.id, pg.id), label: config.profiles.length > 1 ? `${p.name} · ${pg.name}` : pg.name }))),
          ]}
        />
        {page && (
          <ToggleRow
            label="Return when it clears"
            value={page.returnAfter === true}
            onChange={(on) =>
              setOutputs("page.return", (o) => {
                const { returnAfter: _was, ...rest } = page;
                return { ...o, page: on ? { ...rest, returnAfter: true } : rest };
              })
            }
          />
        )}
        <SelectRow
          label="Highlight widget"
          hint={autoRings ? "Auto rings the widgets that show the sensor on a critical alert" : undefined}
          value={highlight}
          onChange={(next) => setHighlight(next as Highlight)}
          options={[
            { value: "none", label: autoRings ? "From Auto" : "None" },
            { value: "sensor", label: "Those showing the sensor" },
            { value: "chosen", label: "Chosen widgets" },
          ]}
        />
        {highlight === "chosen" && (
          <div className="flex max-h-32 flex-col gap-1 overflow-y-auto py-2" role="group" aria-label={`Widgets on ${zonePage.name}`}>
            {zonePage.placements.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-body text-ui-2">
                <input
                  type="checkbox"
                  checked={zones.includes(p.id)}
                  onChange={(e) =>
                    setOutputs("highlight.zones", (o) => {
                      const next = e.target.checked ? [...zones, p.id] : zones.filter((id) => id !== p.id);
                      return { ...o, highlight: next.length > 0 ? { zones: next } : {} };
                    })
                  }
                />
                <span className="truncate">
                  {placementTitle(p)} <span className="text-ui-3">({p.colStart},{p.rowStart})</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
