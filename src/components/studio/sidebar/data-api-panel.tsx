import type { ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { ArrowRight, ClipboardCopy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FIELD_BOX } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { StatusChip, StatusDot } from "@/components/ui/status-chip";
import { useToast } from "@/components/ui/toast";
import { useDataModel } from "@/lib/use-data-model";
import { BUILD_ID } from "@/lib/buildInfo";
import type { DashboardConfig } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { buildReport } from "../explorer/report";
import { sourceIcon } from "../explorer/source-icons";
import type { StudioStatus } from "../use-status-bar";
import { useDownMs } from "../use-data-api-grace";
import { useApiAddress } from "../use-api-address";
import { chipNote, dropText, LINK_CHIP, serverLine, sourceTone } from "./data-api-model";

interface DataApiPanelProps {
  status: StudioStatus;
  config: DashboardConfig;
  /** Write the address: `config.dataApiUrl`, one undo step. */
  onAddress: (url: string) => void;
  /** Leave for the Data sources page. */
  onOpenData: () => void;
}

const NOTE = {
  reconnecting: "Screens keep showing their last reading while Studio reconnects. Nothing turns red unless this lasts more than 10 s.",
  offline: "Studio can't reach the InfoPanel Data API at this address. Check that InfoPanel is running on this PC.",
} as const;

const PROBE = { idle: "", testing: "Testing", ok: "Reachable", fail: "Not reachable" } as const;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center gap-3 text-body">
      <span className="shrink-0 text-ui-3">{label}</span>
      <div className="flex min-w-0 flex-1 justify-end font-ui-mono tabular-nums text-ui-1">{children}</div>
    </div>
  );
}

/**
 * The Data API popover's content, in the sidebar's lazy chunk: the state, the address (the same key, setter and
 * normalizer as Data's Connection card), latency, points, the last drop, the server, the sources with a dot each,
 * Test connection or Retry, the troubleshooting report and the way to Data sources.
 */
export default function DataApiPanel({ status, config, onAddress, onOpenData }: DataApiPanelProps) {
  const toast = useToast();
  const { dataApi, apiHealth, server, retryApi } = status;
  const { link } = apiHealth;
  const downMs = useDownMs(apiHealth);
  const { draft, edit, probe, base, valid, commit, test } = useApiAddress(config.dataApiUrl, onAddress);
  const model = useDataModel();
  const now = Date.now();
  const down = link === "reconnecting" || link === "offline";
  const chip = LINK_CHIP[link];
  const live = model.points.filter((p) => p.type !== "empty").length;
  const pointsNote = link === "reconnecting" ? "holding last values" : link === "offline" ? "stale" : `${live} live`;

  const retry = () => {
    retryApi();
    void test();
  };
  const copyReport = () =>
    buildReport(config, dataApi.base)
      .then((text) => navigator.clipboard.writeText(text))
      .then(() => toast("Report copied"))
      .catch(() => toast("Could not make the report"));

  return (
    <>
      <div className="flex items-center justify-between">
        <Popover.Title className="text-lead font-medium text-ui-1">Data API</Popover.Title>
        <Popover.Close
          render={
            <IconButton label="Close" size={26}>
              <X className="h-4 w-4" />
            </IconButton>
          }
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <StatusChip tone={chip.tone}>{chip.word}</StatusChip>
        <span className="text-caption text-ui-3">{chipNote({ ...apiHealth, downMs }, model.sources, now)}</span>
      </div>
      {(link === "reconnecting" || link === "offline") && <p className="mt-2.5 text-caption leading-snug text-ui-2">{NOTE[link]}</p>}
      <div className="mt-2.5">
        <Row label="Address">
          <input
            type="text"
            value={draft}
            aria-label="Data API URL"
            aria-invalid={!valid}
            aria-describedby={valid ? undefined : "data-api-address-error"}
            spellCheck={false}
            onChange={(e) => edit(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            className={cn(FIELD_BOX, "-mr-1.5 h-7 w-full border-transparent bg-transparent px-1.5 text-right font-ui-mono hover:border-ui-control")}
          />
        </Row>
        {!valid && (
          <p id="data-api-address-error" role="alert" className="pb-1 text-right text-caption text-ui-danger">
            Enter an http(s) URL
          </p>
        )}
        <Row label="Latency">
          <span className={cn(link === "slow" && "text-ui-warn")}>{down || typeof dataApi.latencyMs !== "number" ? "–" : `${dataApi.latencyMs} ms`}</span>
        </Row>
        <Row label="Data points">
          {model.points.length} · {pointsNote}
        </Row>
        <Row label="Last drop">{dropText(apiHealth.lastDrop, now)}</Row>
        <Row label="Studio server">
          <span className="truncate" title={server.kind === "browser" ? "App settings live in the desktop app" : undefined}>
            {serverLine(server, window.location.host)} · {BUILD_ID}
          </span>
        </Row>
        <Row label="API index">
          {base ? (
            <a href={`${base}/`} target="_blank" rel="noreferrer" title="Every data point the Data API serves, grouped by source" className="rounded-ui-sm font-ui text-ui-accent hover:underline">
              Open
            </a>
          ) : (
            <span className="font-ui text-ui-disabled">Open</span>
          )}
        </Row>
      </div>
      <div className="mt-2 border-t border-ui-subtle pt-2.5">
        <h3 className="text-caption font-medium text-ui-3">Sources</h3>
        <ul className="mt-1 max-h-45 overflow-y-auto">
          {model.sources.map((s) => {
            const Icon = sourceIcon(s);
            return (
              <li key={s.id} className="flex h-7.5 items-center gap-2.5 text-body text-ui-1">
                <Icon className="h-4 w-4 shrink-0 text-ui-hint" strokeWidth={1.5} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="shrink-0 text-caption text-ui-3">
                  {s.count} {s.count === 1 ? "point" : "points"}
                </span>
                <StatusDot tone={sourceTone(link, s.status)} />
              </li>
            );
          })}
        </ul>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        {link === "offline" ? (
          <Button variant="primary" onClick={retry}>Retry now</Button>
        ) : (
          <Button onClick={retry} disabled={!valid}>Test connection</Button>
        )}
        <IconButton label="Copy troubleshooting report" size={30} onClick={() => void copyReport()}>
          <ClipboardCopy className="h-4 w-4" strokeWidth={1.5} />
        </IconButton>
        <span role="status" className={cn("min-w-0 flex-1 truncate text-caption", probe === "ok" ? "text-ui-ok" : probe === "fail" ? "text-ui-danger" : "text-ui-3")}>
          {PROBE[probe]}
        </span>
        <button type="button" onClick={onOpenData} className="flex shrink-0 items-center gap-1 rounded-ui-sm text-body text-ui-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent">
          Data sources <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    </>
  );
}
