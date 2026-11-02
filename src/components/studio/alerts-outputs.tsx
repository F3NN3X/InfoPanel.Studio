import { ArrowRightLeft, Highlighter, MonitorPlay } from "lucide-react";
import {
  ALERT_BACKDROPS,
  ALERT_SIZES,
  ALERT_STYLES,
  DISPLAY_SECONDS_MAX,
  type AlertBackdrop,
  type AlertDisplayFull,
  type AlertOutputs as Outputs,
  type AlertRule,
  type AlertSize,
  type AlertStyle,
} from "@/lib/alerts";
import type { DashboardConfig } from "@/lib/layout";
import { ISLAND_HINT, NumField, PositionGrid, TextField } from "./alerts-fields";
import { PanelSection } from "./panel-section";
import { InlineRow, SegmentedRow, SelectRow, StackRow, ToggleRow } from "./setting-rows";
import { placementTitle } from "./studio-modules";

interface AlertOutputsProps {
  rule: AlertRule;
  config: DashboardConfig;
  /** The config's display defaults, shown where the rule sets nothing. */
  defaults: AlertDisplayFull;
  /** The profile and page on the canvas. */
  current: { profile: string; page: string };
  /** Edit the rule under a history key (one undo step per field burst). */
  edit: (field: string, fn: (rule: AlertRule) => AlertRule) => void;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const SIZE_LABEL = { s: "S", m: "M", l: "L" } as const;

const TOKENS = "{name} {value} {unit} {sensor} {app} {title} {body}";

/** The rule's outputs: the kiosk display, switching to a page and highlighting widgets. */
export function AlertOutputs({ rule, config, defaults, current, edit }: AlertOutputsProps) {
  const out = rule.outputs;
  const display = out.display ?? {};
  const setOutputs = (field: string, fn: (o: Outputs) => Outputs) => edit(field, (r) => ({ ...r, outputs: fn(r.outputs) }));
  const setDisplay = (field: string, patch: Partial<NonNullable<Outputs["display"]>>) =>
    setOutputs(`display.${field}`, (o) => ({ ...o, display: { ...o.display, ...patch } }));

  const page = out.page;
  const pageProfile = config.profiles.find((p) => p.id === (page?.profile ?? current.profile)) ?? config.profiles[0];
  // The zones offered for highlighting: the page it switches to, else the one on the canvas.
  const zonePage = pageProfile.pages.find((p) => p.id === (page?.page ?? current.page)) ?? pageProfile.pages[0];
  const zones = out.highlight?.zones ?? [];
  const island = (display.style ?? defaults.style) === "island";

  return (
    <>
      <PanelSection id="alert-display" title="Display" icon={MonitorPlay}>
        <SegmentedRow
          label="Style"
          value={display.style ?? defaults.style}
          onChange={(style) => setDisplay("style", { style: style as AlertStyle })}
          options={ALERT_STYLES.map((s) => ({ value: s, label: cap(s) }))}
        />
        {island && <p className="text-micro leading-snug text-ui-hint">{ISLAND_HINT}</p>}
        {!island && (
          <InlineRow label="Position">
            <PositionGrid value={display.position ?? defaults.position} onChange={(position) => setDisplay("position", { position })} />
          </InlineRow>
        )}
        <SegmentedRow
          label="Size"
          value={display.size ?? defaults.size}
          onChange={(size) => setDisplay("size", { size: size as AlertSize })}
          options={ALERT_SIZES.map((s) => ({ value: s, label: SIZE_LABEL[s] }))}
        />
        {!island && (
          <SegmentedRow
            label="Backdrop"
            value={display.backdrop ?? defaults.backdrop}
            onChange={(backdrop) => setDisplay("backdrop", { backdrop: backdrop as AlertBackdrop })}
            options={ALERT_BACKDROPS.map((b) => ({ value: b, label: cap(b) }))}
          />
        )}
        <InlineRow label="Seconds" hint="0 = stays until acknowledged.">
          <NumField
            label="Display seconds"
            min={0}
            max={DISPLAY_SECONDS_MAX}
            value={display.seconds ?? defaults.seconds}
            onChange={(n) => setDisplay("seconds", { seconds: n ?? 0 })}
          />
        </InlineRow>
        <StackRow label="Text" hint={`Tokens: ${TOKENS}`}>
          <TextField
            label="Alert text"
            mono
            value={display.text ?? ""}
            placeholder="{value} {unit}"
            onChange={(text) =>
              setOutputs("display.text", (o) => {
                const { text: _was, ...rest } = o.display ?? {};
                return { ...o, display: text === "" ? rest : { ...rest, text } };
              })
            }
          />
        </StackRow>
      </PanelSection>

      <PanelSection id="alert-page" title="Switch to page" icon={ArrowRightLeft} defaultOpen={page !== undefined}>
        <ToggleRow
          label="Switch the kiosk to a page"
          value={page !== undefined}
          onChange={(on) =>
            setOutputs("page", (o) => {
              const { page: _was, ...rest } = o;
              if (!on) return rest;
              const profile = config.profiles.find((p) => p.id === current.profile) ?? config.profiles[0];
              return { ...rest, page: { profile: profile.id, page: current.page, returnAfter: true } };
            })
          }
        />
        {page && (
          <>
            <SelectRow
              label="Screen"
              value={pageProfile.id}
              options={config.profiles.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(id) => {
                const target = config.profiles.find((p) => p.id === id);
                if (target) setOutputs("page", (o) => ({ ...o, page: { ...page, profile: target.id, page: target.pages[0].id } }));
              }}
            />
            <SelectRow
              label="Page"
              value={zonePage.id}
              options={pageProfile.pages.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(id) => setOutputs("page", (o) => ({ ...o, page: { ...page, page: id } }))}
            />
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
          </>
        )}
      </PanelSection>

      <PanelSection id="alert-highlight" title="Highlight widget" icon={Highlighter} defaultOpen={out.highlight !== undefined}>
        <ToggleRow
          label="Ring the zones that show the sensor"
          value={out.highlight !== undefined}
          onChange={(on) =>
            setOutputs("highlight", (o) => {
              const { highlight: _was, ...rest } = o;
              return on ? { ...rest, highlight: {} } : rest;
            })
          }
        />
        {out.highlight && (
          <StackRow label="Only these zones" hint={`On “${zonePage.name}”. None ticked = the zones bound to the sensor.`}>
            <div className="max-h-32 space-y-1 overflow-y-auto">
              {zonePage.placements.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-[12.5px] text-ui-2">
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
                    {placementTitle(p)} <span className="text-ui-4">({p.colStart},{p.rowStart})</span>
                  </span>
                </label>
              ))}
            </div>
          </StackRow>
        )}
      </PanelSection>
    </>
  );
}
