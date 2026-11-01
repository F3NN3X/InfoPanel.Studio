import { useCallback, useEffect, useState } from "react";
import { Check, Code, Copy, ExternalLink, FolderOpen, Gauge, ScrollText, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorText, ipc } from "../ipc";
import { deltaTone, diagnosticsSummary, fmt, fmtDelta, groupSeries, isNotable, sampleSummary, type DeltaTone } from "../model/diagnostics";
import { useFound, useStore } from "../store";
import type { Diagnostics, Growth, Series } from "../types";
import { Button, Segmented, Switch, useFlag } from "../ui";

/** Samples arrive every 30 s. */
const REFRESH_MS = 30_000;

const DELTA_CLASS: Record<DeltaTone, string> = { flagged: "text-s-amber", fell: "text-[#7fd1a4]", plain: "text-s-muted" };
const GRID = "grid grid-cols-[minmax(0,2.2fr)_80px_minmax(0,1fr)_minmax(0,1fr)] gap-3";

function DeltaCell({ series, growth }: { series: Series; growth: Growth | null }) {
  return <span role="cell" className={cn("text-right font-mono", DELTA_CLASS[deltaTone(series, growth)])}>{fmtDelta(growth)}</span>;
}

function SeriesTable({ diag, filter }: { diag: Diagnostics; filter: "notable" | "all" }) {
  const found = useFound("diag-table");
  const groups = groupSeries(filter === "all" ? diag.series : diag.series.filter(isNotable));
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroller must take focus so the keyboard can scroll it.
    <div ref={found.ref} role="region" aria-label="Series readings" tabIndex={0} className={cn("overflow-auto rounded-xl border border-s-card-line bg-s-card", found.className)}>
      <div role="table" aria-label="Series" className="min-w-[560px]">
        <div role="row" className={cn(GRID, "border-b border-s-divider px-4 py-2.5 text-[11.5px] text-s-dim")}>
          <span role="columnheader">Series</span>
          <span role="columnheader" className="text-right">Latest</span>
          <span role="columnheader" className="text-right">Δ 30 min</span>
          <span role="columnheader" className="text-right">Δ 60 min</span>
        </div>
        {groups.length === 0 && <div className="px-4 py-6 text-[12.5px] text-s-dim">Nothing stands out.</div>}
        {groups.map((g) => (
          <div key={g.name} role="rowgroup">
            <div role="row" className="px-4 pb-1 pt-2.5 text-[11px] uppercase tracking-[0.06em] text-s-dim"><span role="rowheader">{g.name}</span></div>
            {g.rows.map(({ series, name }) => (
              <div key={series.name} role="row" className={cn(GRID, "items-center px-4 py-[7px] text-[12.5px] hover:bg-ui-tile")}>
                <span role="cell" className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", series.growing ? "bg-s-amber" : "bg-[#55555e]")} />
                  {series.growing && <span className="sr-only">Rising: </span>}
                  <span className="truncate font-mono text-s-t2">{name}</span>
                </span>
                <span role="cell" className="text-right font-mono">{fmt(series.latest)}</span>
                <DeltaCell series={series} growth={series.growth30} />
                <DeltaCell series={series} growth={series.growth60} />
              </div>
            ))}
          </div>
        ))}
        <div className="h-2" />
      </div>
    </div>
  );
}

export function DiagnosticsSection() {
  const { settings, status, go, toast } = useStore();
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [filter, setFilter] = useState<"notable" | "all">("notable");
  const [copied, flash] = useFlag();
  const actions = useFound("diag-actions");

  const [unreadable, setUnreadable] = useState(false);
  const refresh = useCallback(
    () =>
      ipc
        .getDiagnostics()
        .then((d) => {
          setDiag(d);
          setUnreadable(false);
        })
        .catch(() => setUnreadable(true)),
    []
  );
  useEffect(() => {
    const timer = setInterval(() => document.visibilityState === "visible" && void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticsSummary(diag ?? (await ipc.getDiagnostics())));
      flash();
    } catch (e) {
      toast(errorText(e), true);
    }
  };
  const fail = (e: unknown) => toast(errorText(e), true);
  // Samples are taken by the running server: a debug mode saved after it started needs a restart first.
  const sampling = status.runningConfig ? status.runningConfig.debug : (diag?.debug ?? false);
  const notable = diag?.series.filter(isNotable).length ?? 0;

  return (
    <>
      {unreadable && (
        <span role="alert" className="px-0.5 text-[12.5px] leading-[1.45] text-s-red">
          Can't read the diagnostics. The server may be stopped; check the Server page.
        </span>
      )}
      <div className="overflow-hidden rounded-xl border border-s-card-line bg-s-card">
        <DebugRow onSaved={() => void refresh()} />
        <div ref={actions.ref} className={cn("flex flex-wrap gap-2 px-[18px] pb-4", actions.className)}>
          <Button onClick={() => go("logs")}>
            <ScrollText className="h-4 w-4" />
            View logs
          </Button>
          <Button onClick={() => void ipc.openLogsFolder().catch(fail)}>
            <FolderOpen className="h-4 w-4" />
            Open logs folder
          </Button>
          {/* The shell refuses DevTools unless debug mode is on. */}
          {diag?.debug && (
            <Button onClick={() => void ipc.openDevtools().catch(fail)}>
              <Code className="h-4 w-4" />
              Open DevTools
            </Button>
          )}
          <Button onClick={() => void ipc.openWebviewTaskManager().catch(fail)} title="Shows memory and CPU per WebView2 process: renderer, GPU…">
            <Gauge className="h-4 w-4" />
            Open WebView2 task manager
          </Button>
          <Button onClick={() => void copy()}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy diagnostics summary"}
          </Button>
        </div>
      </div>

      {/* The server serves these pages in debug mode only (it must be running with it). */}
      {sampling ? (
        <div className="overflow-hidden rounded-xl border border-s-card-line bg-s-card">
          <ToolRow
            title="Widget QA"
            text="Every widget at a set of sizes from fixture sensors, to spot overflow and clipping."
            onOpen={() => void ipc.openExternal(`${status.origin}/widget-qa`).catch(fail)}
          />
          <ToolRow
            title="InfoPanel lab"
            text="Opens .infopanel exports and compares InfoPanel's render with ours. Works on files you open."
            onOpen={() => void ipc.openExternal(`${status.origin}/lab/`).catch(fail)}
          />
        </div>
      ) : (
        <span className="px-0.5 text-[12.5px] leading-[1.45] text-s-dim">Widget QA and the InfoPanel lab are available while debug mode is on and the server has restarted with it.</span>
      )}

      {diag && !sampling && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-s-input-line px-5 py-9 text-center">
          <Activity className="h-7 w-7 text-s-faint" />
          <span className="text-[13.5px] font-medium">No samples</span>
          <span className="max-w-[360px] text-[12.5px] leading-[1.45] text-s-muted">
            {settings.debug ? "Restart the server to start sampling." : "Turn on debug mode and restart the server to sample memory and event-loop delay."}
          </span>
        </div>
      )}
      {diag && sampling && (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-end gap-3 pl-0.5">
            <div className="flex min-w-[140px] flex-1 flex-col gap-[3px]">
              <span className="text-xs font-medium text-s-muted">Samples</span>
              <span className="text-[12.5px] leading-[1.45] text-s-dim">
                {sampleSummary(diag)} A series is flagged when it rose in 80% of samples over the last hour and by more than 20%.
              </span>
            </div>
            <Segmented
              label="Series filter"
              size="sm"
              options={[
                { value: "notable", label: `Notable (${notable})` },
                { value: "all", label: `All ${diag.series.length}` },
              ]}
              value={filter}
              onChange={setFilter}
            />
          </div>
          <SeriesTable diag={diag} filter={filter} />
        </div>
      )}
    </>
  );
}

function DebugRow({ onSaved }: { onSaved: () => void }) {
  const { settings, save } = useStore();
  const found = useFound("debug");
  return (
    <div ref={found.ref} className={cn("flex items-center gap-4 px-[18px] py-4", found.className)}>
      <div className="flex flex-1 flex-col gap-[3px]">
        <span className="text-sm font-medium">Debug mode</span>
        <span className="text-[12.5px] leading-[1.45] text-s-muted">Logs every server request and samples memory every 30 s to find errors and leaks. Needs a server restart.</span>
      </div>
      <Switch checked={settings.debug} onChange={(v) => void save("debug", v).then(onSaved)} label="Debug mode" />
    </div>
  );
}

function ToolRow({ title, text, onOpen }: { title: string; text: string; onOpen: () => void }) {
  return (
    <div className="flex items-center gap-4 px-[18px] py-4">
      <div className="flex flex-1 flex-col gap-[3px]">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-[12.5px] leading-[1.45] text-s-muted">{text}</span>
      </div>
      <Button onClick={onOpen}>
        <ExternalLink className="h-4 w-4" />
        Open
      </Button>
    </div>
  );
}
