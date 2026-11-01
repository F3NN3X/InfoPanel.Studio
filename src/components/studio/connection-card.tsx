import { useState } from "react";
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { DEFAULT_API_BASE, normalizeApiBase, testApiBase, type DataApiState } from "@/lib/data-api";
import { cn } from "@/lib/utils";
import { FIELD, StackRow } from "./setting-rows";

interface ConnectionCardProps {
  /** The saved base URL (undefined = default). */
  value?: string;
  onChange: (url: string) => void;
  /** The live state and the last ping (the status bar's, SPEC §3.4). */
  dataApi: { state: DataApiState; latencyMs?: number | null };
}

type Probe = "idle" | "testing" | "ok" | "fail";

/** The status pill's wording: "Connected · 18 ms", "Slow · 640 ms", or the error. */
export function connectionPill(dataApi: ConnectionCardProps["dataApi"]): { text: string; tone: "ok" | "warn" | "bad" } {
  const ms = typeof dataApi.latencyMs === "number" ? ` · ${dataApi.latencyMs} ms` : "";
  switch (dataApi.state) {
    case "connected":
      return { text: `Connected${ms}`, tone: "ok" };
    case "slow":
      return { text: `Slow${ms}`, tone: "warn" };
    default:
      return { text: "Can't reach the Data API", tone: "bad" };
  }
}

const PILL = {
  ok: { icon: CircleCheck, tone: "text-ui-success" },
  warn: { icon: TriangleAlert, tone: "text-ui-warning" },
  bad: { icon: CircleAlert, tone: "text-ui-danger" },
} as const;

/**
 * Data's Connection card (SPEC §10.2): the status pill, the Data API URL, Test connection and the
 * API index. It was Behaviour › Connection in the old profile inspector.
 */
export function ConnectionCard({ value, onChange, dataApi }: ConnectionCardProps) {
  const saved = value ?? DEFAULT_API_BASE;
  const [draft, setDraft] = useState(saved);
  const [probe, setProbe] = useState<Probe>("idle");
  const valid = normalizeApiBase(draft) !== null;
  const pill = connectionPill(dataApi);
  const Icon = PILL[pill.tone].icon;

  const commit = () => {
    const base = normalizeApiBase(draft);
    if (base === null) return;
    setDraft(base);
    if (base !== saved) onChange(base);
  };

  const test = async () => {
    const base = normalizeApiBase(draft);
    if (base === null) return;
    setProbe("testing");
    setProbe((await testApiBase(base)) ? "ok" : "fail");
  };

  return (
    <section data-nav-section="connection" aria-label="Connection" className="flex shrink-0 flex-col gap-2 border-b border-ui-subtle p-3.5 font-ui">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[13px] font-semibold text-ui-1">Connection</span>
        <span className={cn("flex items-center gap-[5px] text-[11.5px]", PILL[pill.tone].tone)}>
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {pill.text}
        </span>
      </div>
      <StackRow label="Data API URL" hint="Where the dashboard reads sensor data from">
        <input
          type="text"
          value={draft}
          aria-label="Data API URL"
          aria-invalid={!valid}
          aria-describedby={valid ? undefined : "data-api-url-error"}
          data-nav-control="url"
          onChange={(e) => {
            setDraft(e.target.value);
            setProbe("idle");
          }}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          spellCheck={false}
          className={cn(FIELD, "h-[30px] w-full font-ui-mono text-[11.5px]", !valid && "border-ui-danger")}
        />
      </StackRow>
      {!valid && (
        <div id="data-api-url-error" role="alert" className="text-[11px] text-ui-danger">
          Enter an http(s) URL.
        </div>
      )}
      <div className="flex min-h-7 items-center gap-2 text-[12px] text-ui-3">
        <span className="min-w-0 flex-1 truncate">Test connection</span>
        <span role="status" className="flex items-center gap-2">
          {probe === "testing" && <span>testing…</span>}
          {probe === "ok" && <span className="text-ui-success">connected</span>}
          {probe === "fail" && <span className="text-ui-danger">not reachable</span>}
        </span>
        <button
          type="button"
          onClick={() => void test()}
          disabled={!valid}
          className="h-7 rounded-md border border-ui-strong px-2.5 text-ui-2 hover:bg-ui-hover hover:text-ui-1 disabled:pointer-events-none disabled:opacity-40"
        >
          Test
        </button>
      </div>
      <div className="flex min-h-7 items-center gap-2 text-[12px] text-ui-3">
        <span className="min-w-0 flex-1 truncate">API index</span>
        {valid ? (
          <a
            href={`${normalizeApiBase(draft)}/`}
            target="_blank"
            rel="noreferrer"
            title="Every data point the Data API serves, grouped by source"
            className="rounded-sm text-ui-accent-text hover:underline"
          >
            Open ↗
          </a>
        ) : (
          <span className="text-ui-hint">Open ↗</span>
        )}
      </div>
    </section>
  );
}
