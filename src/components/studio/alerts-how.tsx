import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Tag } from "@/components/ui/tag";
import { useToast } from "@/components/ui/toast";
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
  type Severity,
} from "@/lib/alerts";
import { postControl } from "@/lib/control";
import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { ISLAND_HINT, NumField, PositionGrid, SeverityDot, TextField } from "./alerts-fields";
import { targetsOf } from "./alerts-history-model";
import { fillAlertText } from "./alerts-model";
import { AlertPreview, type Landing } from "./alerts-preview";
import { InlineRow, SegmentedRow, StackRow } from "./setting-rows";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const SIZE_LABEL = { s: "S", m: "M", l: "L" } as const;
const TOKENS = "{name} {value} {unit} {sensor} {app} {title} {body}";

const NOTE: Record<AlertStyle, string> = {
  auto: "Picks by severity and by screen. Recommended",
  island: ISLAND_HINT,
  toast: "A card on the screen, in the corner you pick",
  banner: "A strip across the top or bottom of the screen",
  overlay: "A large card over the page",
};

const AUTO_TABLE: { severity: Severity; island: string; none: string }[] = [
  { severity: "info", island: "Quiet notice in the island", none: "Small toast" },
  { severity: "warning", island: "Island", none: "Toast" },
  { severity: "critical", island: "Island and widget highlight", none: "Toast and highlight" },
];

/** Where a style lands on a screen. */
export function landingOf(style: AlertStyle, profile: MonitorProfile): Landing {
  const island = profile.island?.enabled === true;
  if (style === "auto") return island ? "island" : "toast";
  if (style === "island") return island ? "island" : "top toast";
  return style;
}

const SAYS: Record<Landing, string> = { island: "the island", toast: "a toast", "top toast": "a top toast", banner: "a banner", overlay: "an overlay" };

/** The Auto table: the rule's own severity is the marked row. */
function AutoTable({ severity }: { severity: Severity }) {
  return (
    <table className="w-full border-collapse overflow-hidden rounded-10 text-left text-caption text-ui-2 outline outline-1 -outline-offset-1 outline-ui-default">
      <thead>
        <tr className="text-ui-3">
          <th scope="col" className="px-3 py-2 font-normal">Severity</th>
          <th scope="col" className="px-3 py-2 font-normal">With an island</th>
          <th scope="col" className="px-3 py-2 font-normal">Without one</th>
        </tr>
      </thead>
      <tbody>
        {AUTO_TABLE.map((row) => (
          <tr key={row.severity} aria-current={row.severity === severity || undefined} className={cn("border-t border-ui-row", row.severity === severity && "bg-ui-raised text-ui-1")}>
            <th scope="row" className="px-3 py-2 font-normal">
              <span className="flex items-center gap-2 capitalize">
                <SeverityDot severity={row.severity} className="h-1.5 w-1.5" />
                {row.severity}
              </span>
            </th>
            <td className="px-3 py-2">{row.island}</td>
            <td className="px-3 py-2">{row.none}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface AlertHowProps {
  rule: AlertRule;
  config: DashboardConfig;
  /** The config's display defaults, shown where the rule sets nothing. */
  defaults: AlertDisplayFull;
  /** The rule's reading now, for the rendered text. */
  sample: { value: string; unit: string; sensor: string };
  /** Why Test can't run, if it can't. */
  testBlocked: string | undefined;
  /** Edit the rule under a history key (one undo step per field burst). */
  edit: (field: string, fn: (rule: AlertRule) => AlertRule) => void;
}

/** How it shows: the style with a preview per screen, the Auto table, the display's settings and the test. */
export function AlertHow({ rule, config, defaults, sample, testBlocked, edit }: AlertHowProps) {
  const toast = useToast();
  const display = rule.outputs.display ?? {};
  const style = display.style ?? defaults.style;
  const setOutputs = (field: string, fn: (o: Outputs) => Outputs) => edit(field, (r) => ({ ...r, outputs: fn(r.outputs) }));
  const setDisplay = (field: string, patch: Partial<NonNullable<Outputs["display"]>>) =>
    setOutputs(`display.${field}`, (o) => ({ ...o, display: { ...o.display, ...patch } }));

  const screens = targetsOf(rule.profiles, config.profiles);
  const [screenId, setScreenId] = useState<string | undefined>(undefined);
  const screen = screens.find((p) => p.id === screenId) ?? screens[0] ?? config.profiles[0];
  const landing = landingOf(style, screen);
  const size = display.size ?? defaults.size;
  // Auto keeps an info alert small on the server, so its Size has nothing to change.
  const quiet = style === "auto" && rule.severity === "info";
  const template = display.text || "{value} {unit}";
  const shown = fillAlertText(template, { ...sample, name: rule.name });

  const test = () =>
    void postControl("alert", { ruleId: rule.id, action: "test" }).then((res) => toast(res ? "Test alert sent" : "Couldn't reach the server"));

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h2 className="text-lead font-medium text-ui-1">How it shows</h2>
      <Segmented
        label="How it shows"
        className="[&>button]:flex-1"
        value={style}
        onChange={(next) => setDisplay("style", { style: next })}
        options={ALERT_STYLES.map((s) => ({ value: s, label: cap(s) }))}
      />
      <p className="text-caption text-ui-3">{NOTE[style]}</p>
      <div role="group" aria-label="Preview on" className="flex flex-wrap gap-1.5">
        {screens.map((p) => (
          <Tag key={p.id} selected={p.id === screen.id} onClick={() => setScreenId(p.id)}>
            {p.name}
            <span className="text-ui-3">· {p.island?.enabled ? "island" : "no island"}</span>
          </Tag>
        ))}
      </div>
      <AlertPreview profile={screen} landing={landing} name={rule.name} text={shown} severity={rule.severity} position={display.position ?? defaults.position} small={quiet || size === "s"} />
      <p className="text-caption text-ui-3">{screen.name} shows it as {SAYS[landing]}</p>
      {style === "auto" && <AutoTable severity={rule.severity} />}
      <div className="flex flex-col border-t border-ui-subtle pt-2 [&>*]:min-h-9">
        {style !== "island" && (
          <InlineRow label="Position">
            <PositionGrid value={display.position ?? defaults.position} onChange={(position) => setDisplay("position", { position })} />
          </InlineRow>
        )}
        {!quiet && (
          <SegmentedRow
            label="Size"
            value={size}
            onChange={(next) => setDisplay("size", { size: next as AlertSize })}
            options={ALERT_SIZES.map((s) => ({ value: s, label: SIZE_LABEL[s] }))}
          />
        )}
        {style !== "island" && (
          <SegmentedRow
            label="Backdrop"
            value={display.backdrop ?? defaults.backdrop}
            onChange={(backdrop) => setDisplay("backdrop", { backdrop: backdrop as AlertBackdrop })}
            options={ALERT_BACKDROPS.map((b) => ({ value: b, label: cap(b) }))}
          />
        )}
        <InlineRow label="Show for" hint="0 = stays until acknowledged">
          <NumField label="Display seconds" unit="s" min={0} max={DISPLAY_SECONDS_MAX} value={display.seconds ?? defaults.seconds} onChange={(n) => setDisplay("seconds", { seconds: n ?? 0 })} />
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
          {shown && <p className="text-right text-caption text-ui-3">Shows as <span className="font-ui-mono text-ui-2">{shown}</span></p>}
        </StackRow>
      </div>
      <Button className="w-full" icon={<FlaskConical aria-hidden />} disabled={testBlocked !== undefined} onClick={test}>
        Send a test to displays
      </Button>
      {testBlocked ? (
        <p className="text-caption text-ui-warn">{testBlocked}</p>
      ) : (
        <p className="text-pretty text-caption leading-[1.45] text-ui-3">
          Replaces this rule's alert if it's already showing, and is marked as a test on the screen and in History. A screen shows one alert at a time; others wait in the island.
        </p>
      )}
    </div>
  );
}
