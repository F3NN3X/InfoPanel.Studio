import { useRef } from "react";
import { Copy, Download, ExternalLink, FileText, Link2, Plus, Trash2, Waypoints } from "lucide-react";
import { Popover } from "@/components/ui/popover";
import { useToast } from "@/components/ui/toast";
import { refreshCatalog } from "@/lib/catalog";
import type { DashboardConfig } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { useEndpoints } from "./explorer-endpoints";
import { buildReport, saveReport } from "./report";
import { useCopy } from "./use-copy";

interface ExplorerHeaderProps {
  pointCount: number;
  sourceCount: number;
  apiBase: string;
  config: DashboardConfig;
}

const MENU_ITEM =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ui-2 hover:bg-ui-hover hover:text-ui-1";

/** The Data view's top bar: title and counts, Report, Endpoints and Add source (the connection is its own card). */
export function ExplorerHeader({ pointCount, sourceCount, apiBase, config }: ExplorerHeaderProps) {
  const copy = useCopy();
  const toast = useToast();
  const endpoints = useEndpoints();
  const actionsRef = useRef<HTMLDivElement>(null);

  const clearPushed = () => {
    fetch(`${apiBase}/api/clear`, { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error("clear failed");
        toast("Cleared pushed values");
        return refreshCatalog();
      })
      .catch(() => toast("Could not clear pushed values"));
  };

  const report = (then: (text: string) => Promise<unknown>) => {
    buildReport(config, apiBase)
      .then(then)
      .catch(() => toast("Could not make the report"));
  };
  const copyReport = () => report((text) => navigator.clipboard.writeText(text).then(() => toast("Report copied")));
  const saveIt = () => report((text) => saveReport(text).then((saved) => saved && toast("Report saved")));

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-ui-subtle bg-ui-chrome px-4 py-3 font-ui">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="text-[14px] font-semibold leading-[1.2] text-ui-1">Data</div>
        <div className="text-[11.5px] leading-[1.2] text-ui-4">
          {pointCount} data points from {sourceCount} sources
        </div>
      </div>

      <div ref={actionsRef} className="flex items-center gap-3">
        <Popover
          align="end"
          className="w-[300px]"
          triggerClassName="inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-[7px] border border-ui-strong bg-ui-raised px-[11px] text-[12px] text-ui-1 hover:bg-[#1e1e23] aria-expanded:bg-ui-active"
          trigger={
            <>
              <FileText className="h-4 w-4" />
              Report
            </>
          }
        >
          <div className="px-2 pb-1.5 pt-1.5 text-[11.5px] leading-[1.4] text-ui-4">
            A troubleshooting report to attach to a bug report: versions, the Data API's state and the hardware readings. It
            leaves out names, addresses, folders, plugin entries and text values.
          </div>
          <button type="button" className={MENU_ITEM} onClick={copyReport}>
            <Copy className="h-3.5 w-3.5 shrink-0" />
            Copy troubleshooting report
          </button>
          <button type="button" className={MENU_ITEM} onClick={saveIt}>
            <Download className="h-3.5 w-3.5 shrink-0" />
            Save troubleshooting report…
          </button>
        </Popover>

        <Popover
          align="end"
          anchor={actionsRef}
          className="w-[min(520px,calc(100vw-32px))] rounded-[10px] p-1.5"
          triggerClassName="inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-[7px] border border-ui-strong bg-ui-raised px-[11px] text-[12px] text-ui-1 hover:bg-[#1e1e23] aria-expanded:bg-ui-active"
          trigger={
            <>
              <Waypoints className="h-4 w-4" />
              Endpoints
            </>
          }
        >
          <div className="max-h-[70vh] overflow-y-auto">
            <div className="px-2.5 pb-1.5 pt-2 text-[11.5px] text-ui-4">
              All data is served by the local Data API. Click a path to copy it.
            </div>
            {endpoints.map((e) => (
              <button
                key={`${e.method} ${e.path}`}
                type="button"
                onClick={() => copy(`${apiBase}${e.path}`)}
                className="grid w-full grid-cols-[44px_minmax(0,1fr)] gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-[#202026]"
              >
                <span
                  className={cn(
                    "pt-px font-ui-mono text-[10.5px] font-medium",
                    e.method === "GET" ? "text-ui-success" : "text-ui-warning"
                  )}
                >
                  {e.method}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="block break-all font-ui-mono text-[11.5px] text-ui-1">{e.path}</span>
                  <span className="block text-[11.5px] text-ui-4">{e.description}</span>
                </span>
              </button>
            ))}
          </div>
        </Popover>

        <Popover
          align="end"
          className="w-[280px]"
          triggerClassName="inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-[7px] bg-ui-inverse px-3 text-[12px] font-semibold text-ui-inverse-fg hover:opacity-90"
          trigger={
            <>
              <Plus className="h-4 w-4" />
              Add source
            </>
          }
        >
          <button type="button" className={MENU_ITEM} onClick={() => copy(`${apiBase}/api/push`)}>
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            Copy the push URL (POST /api/push)
          </button>
          <button type="button" className={MENU_ITEM} onClick={clearPushed}>
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
            Clear pushed values
          </button>
          <a href={`${apiBase}/`} target="_blank" rel="noreferrer" className={MENU_ITEM}>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            Open the Data API index
          </a>
        </Popover>
      </div>
    </div>
  );
}
