import { useEffect, useMemo, useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { StatusChip } from "@/components/ui/status-chip";
import { Toggle } from "@/components/ui/toggle";
import type { AlertHistoryEntry, Severity } from "@/lib/alerts";
import type { MonitorProfile } from "@/lib/layout";
import { SeverityDot } from "./alerts-fields";
import { endedOf, filterHistory, landedText, screensText, targetsOf, valueText, whenText, type HistoryFilter } from "./alerts-history-model";

const FILTERS: { value: HistoryFilter["severity"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
];

const HEAD = "whitespace-nowrap px-5 py-3 text-left text-caption font-normal text-ui-3";
const CELL = "whitespace-nowrap px-5 py-3 text-body text-ui-2";

function Row({ row, profiles, now }: { row: AlertHistoryEntry; profiles: readonly MonitorProfile[]; now: number }) {
  const ended = endedOf(row);
  return (
    <tr className="border-t border-ui-row">
      <td className={`${CELL} font-ui-mono text-caption text-ui-3`}>{whenText(row.startedAt, now)}</td>
      <td className="w-full max-w-0 px-5 py-3 text-body text-ui-1">
        <span className="flex items-center gap-2" title={row.text}>
          <SeverityDot severity={row.severity as Severity} className="h-1.5 w-1.5" />
          <span className="truncate">{row.name}</span>
          {row.test && <StatusChip tone="neutral" dot={false} className="h-5 px-2 text-micro">Test</StatusChip>}
          {row.quiet && <StatusChip tone="neutral" dot={false} className="h-5 px-2 text-micro">Quiet</StatusChip>}
        </span>
      </td>
      <td className={`${CELL} text-right font-ui-mono text-ui-1`}>{valueText(row)}</td>
      <td className={CELL}>{landedText(row.shownAs, targetsOf(row.profiles, profiles))}</td>
      <td className={CELL}>{screensText(row, profiles)}</td>
      <td className={CELL}>
        <StatusChip tone={ended.tone} dot={false} className="h-5 px-2 text-micro">{ended.label}</StatusChip>
      </td>
    </tr>
  );
}

interface AlertsHistoryProps {
  history: readonly AlertHistoryEntry[];
  profiles: readonly MonitorProfile[];
  filter: HistoryFilter;
  onFilter: (filter: HistoryFilter) => void;
}

/** Alerts & Island › History: what the server keeps (its last 200), by severity, with or without tests. */
export function AlertsHistory({ history, profiles, filter, onFilter }: AlertsHistoryProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const rows = useMemo(() => filterHistory(history, filter), [history, filter]);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-7 py-4 max-sm:px-3">
      <div className="flex items-center justify-between gap-3">
        <Segmented label="Severity" value={filter.severity} options={FILTERS} onChange={(severity) => onFilter({ ...filter, severity })} />
        <label className="flex items-center gap-2 text-body text-ui-2">
          Include tests
          <Toggle checked={filter.tests} label="Include tests" onChange={(tests) => onFilter({ ...filter, tests })} />
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-body text-ui-3">No alerts yet</p>
      ) : (
        <div className="overflow-x-auto rounded-14 border border-ui-default bg-ui-panel">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={HEAD}>When</th>
                <th scope="col" className={HEAD}>Alert</th>
                <th scope="col" className={`${HEAD} text-right`}>Value</th>
                <th scope="col" className={HEAD}>Shown as</th>
                <th scope="col" className={HEAD}>Screens</th>
                <th scope="col" className={HEAD}>Ended</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row key={row.id} row={row} profiles={profiles} now={now} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
