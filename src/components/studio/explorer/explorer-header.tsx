import { useRef } from "react";
import { Copy, Download, ExternalLink, FileText, Link2, Plus, Search, Trash2, Waypoints, X } from "lucide-react";
import { CONTROL_MOTION, FOCUS_RING } from "@/components/ui/button";
import { FIELD_BOX } from "@/components/ui/field";
import { Menu } from "@/components/ui/menu";
import { Popover } from "@/components/ui/popover";
import { useToast } from "@/components/ui/toast";
import { refreshCatalog } from "@/lib/catalog";
import type { DashboardConfig } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { BarFill, BarTitle, PageBar } from "../page-bar";
import { useEndpoints } from "./explorer-endpoints";
import { buildReport, saveReport } from "./report";
import { useCopy } from "./use-copy";

interface ExplorerHeaderProps {
  pointCount: number;
  sourceCount: number;
  /** Points a screen or an alert rule uses. */
  inUseCount: number;
  /** Points the search, a tag, a switch or the source list leaves; null while none narrows the table. */
  shownCount: number | null;
  query: string;
  onQuery: (query: string) => void;
  apiBase: string;
  config: DashboardConfig;
}

const TRIGGER = cn(
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-ui-md px-3 text-body font-medium [&_svg]:h-4 [&_svg]:w-4",
  FOCUS_RING,
  CONTROL_MOTION
);
const GHOST = cn(TRIGGER, "text-ui-2 hover:bg-ui-raised hover:text-ui-1 aria-expanded:bg-ui-raised aria-expanded:text-ui-1");
const PRIMARY = cn(TRIGGER, "bg-ui-inverse text-ui-inverse-fg hover:bg-white");

const MENU_ITEM = cn(
  "flex h-8 w-full items-center gap-2 rounded-ui-sm px-2 text-left text-body text-ui-2 hover:bg-ui-hover hover:text-ui-1",
  FOCUS_RING,
  "[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-ui-hint"
);

const ROW = "justify-start gap-2 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-ui-hint";

/** The Data sources page's bar: the title and count line, search, Endpoints, Report and Add source (the one primary). */
export function ExplorerHeader({ pointCount, sourceCount, inUseCount, shownCount, query, onQuery, apiBase, config }: ExplorerHeaderProps) {
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
    <PageBar>
      <BarTitle
        title="Data sources"
        note={`${shownCount === null ? pointCount : `${shownCount} of ${pointCount}`} points · ${sourceCount} ${sourceCount === 1 ? "source" : "sources"} · ${inUseCount} in use`}
      />
      <BarFill />

      <div ref={actionsRef} className="flex min-w-0 items-center gap-2 max-sm:w-full">
        <label className="relative w-75 min-w-30 shrink max-sm:w-full">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-hint" strokeWidth={1.5} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search key, name or value"
            aria-label="Search key, name or value"
            className={cn(FIELD_BOX, "w-full pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden")}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onQuery("")}
              className={cn("absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-ui-sm text-ui-3 hover:text-ui-1", FOCUS_RING)}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </label>

        <Popover
          align="end"
          anchor={actionsRef}
          className="w-[min(520px,calc(100vw-32px))] p-2"
          triggerClassName={GHOST}
          trigger={
            <>
              <Waypoints strokeWidth={1.5} />
              <span className="max-xl:sr-only">Endpoints</span>
            </>
          }
        >
          <div className="max-h-[70vh] overflow-y-auto">
            <div className="px-2.5 pb-1.5 pt-2 text-caption text-ui-3">All data is served by the local Data API. Click a path to copy it</div>
            {endpoints.map((e) => (
              <button
                key={`${e.method} ${e.path}`}
                type="button"
                onClick={() => copy(`${apiBase}${e.path}`)}
                className={cn("grid w-full grid-cols-[44px_minmax(0,1fr)] gap-2.5 rounded-ui-sm px-2.5 py-2 text-left hover:bg-ui-hover", FOCUS_RING)}
              >
                <span className={cn("pt-px font-ui-mono text-caption font-medium", e.method === "GET" ? "text-ui-ok" : "text-ui-warn")}>{e.method}</span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="block break-all font-ui-mono text-caption text-ui-1">{e.path}</span>
                  <span className="block text-caption text-ui-3">{e.description}</span>
                </span>
              </button>
            ))}
          </div>
        </Popover>

        <Popover
          align="end"
          className="w-75"
          triggerClassName={GHOST}
          trigger={
            <>
              <FileText strokeWidth={1.5} />
              <span className="max-xl:sr-only">Report</span>
            </>
          }
        >
          <div className="px-2 pb-1.5 pt-1.5 text-caption leading-[1.4] text-ui-3">
            A troubleshooting report to attach to a bug report: versions, the Data API's state and the hardware readings. It leaves out names,
            addresses, folders, plugin entries and text values.
          </div>
          <button type="button" className={MENU_ITEM} onClick={copyReport}>
            <Copy strokeWidth={1.5} />
            Copy troubleshooting report
          </button>
          <button type="button" className={MENU_ITEM} onClick={saveIt}>
            <Download strokeWidth={1.5} />
            Save troubleshooting report…
          </button>
        </Popover>

        <Menu.Root>
          <Menu.Trigger className={PRIMARY}>
            <Plus strokeWidth={1.75} />
            Add source
          </Menu.Trigger>
          <Menu.Content className="w-70">
            <Menu.Item className={ROW} onClick={() => copy(`${apiBase}/api/push`)}>
              <Link2 strokeWidth={1.5} />
              Copy the push URL (POST /api/push)
            </Menu.Item>
            <Menu.Item className={ROW} onClick={clearPushed}>
              <Trash2 strokeWidth={1.5} />
              Clear pushed values
            </Menu.Item>
            <Menu.Item className={ROW} render={<a href={`${apiBase}/`} target="_blank" rel="noreferrer" />}>
              <ExternalLink strokeWidth={1.5} />
              Open the Data API index
            </Menu.Item>
          </Menu.Content>
        </Menu.Root>
      </div>
    </PageBar>
  );
}
