import { useEffect, useRef, useState, type ReactNode } from "react";
import { DialogParts } from "@/components/ui/dialog";
import { Check, Download, FileOutput, Gauge, Monitor, Package, X, type LucideIcon } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { dataOf } from "@/components/library/library-actions";
import { gaugePayload } from "@/lib/gauge-studio/import-file";
import { gaugeDataOf } from "@/lib/gauge-studio/model";
import type { VectorGauge } from "@/lib/infopanel/gauges/vector";
import type { DashboardConfig, MonitorProfile, Placement } from "@/lib/layout";
import { listLibrary, type LibraryItem } from "@/lib/library";
import { cn } from "@/lib/utils";
import { configPayload, copyPayload, saveFilePayload, type FilePayload } from "./config-file";
import type { ExportRequest } from "./file-doors";
import { bundledScreenPayload } from "./profile-file";

type Row = NonNullable<ExportRequest["row"]>;

const PRIMARY = "h-7 shrink-0 rounded-ui-md bg-ui-inverse px-3 text-body font-medium text-ui-inverse-fg hover:opacity-90 disabled:cursor-not-allowed disabled:bg-ui-active disabled:text-ui-hint";
const OUTLINE = "h-7 shrink-0 rounded-ui-md border border-ui-strong px-3 text-body font-medium text-ui-2 hover:bg-ui-hover hover:text-ui-1 disabled:cursor-not-allowed disabled:opacity-40";

interface ExportRowProps {
  icon: LucideIcon;
  title: string;
  detail: string;
  /** Marked as the row the sheet opened on. */
  picked: boolean;
  /** Why the row cannot be used, shown in place of its options. */
  blocked?: string;
  /** Options, a chooser or a note under the detail. */
  children?: ReactNode;
  /** The row's buttons. */
  actions: ReactNode;
  /** Copy JSON: the payload the file holds; absent when the row has none yet. */
  copy?: FilePayload;
  onCopied: (row: string) => void;
  copied: boolean;
  id: Row;
}

function ExportRow({ icon: Icon, title, detail, picked, blocked, children, actions, copy, onCopied, copied, id }: ExportRowProps) {
  const toast = useToast();
  return (
    <section aria-label={title} className={cn("flex flex-col gap-2 rounded-ui-lg border px-3.5 py-3", picked ? "border-ui-accent bg-ui-accent-soft" : "border-ui-default bg-ui-chrome")}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0 text-ui-3" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <div className="text-body font-medium text-ui-1">{title}</div>
          <div className="text-pretty text-caption text-ui-4">{detail}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
      {blocked ? <p className="pl-7.5 text-micro text-ui-warn">{blocked}</p> : children}
      <div className="pl-7.5">
        <button
          type="button"
          disabled={!copy}
          onClick={() => copy && void copyPayload(copy).then(() => onCopied(id), () => toast("Couldn’t copy the JSON"))}
          className="flex items-center gap-1 text-micro text-ui-accent-text hover:underline disabled:cursor-not-allowed disabled:text-ui-hint disabled:no-underline"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Copied
            </>
          ) : (
            "Copy JSON"
          )}
        </button>
      </div>
    </section>
  );
}

/** The gauges in My library whose spec can be a `.gauge.json` (an image sequence has none). */
function GaugeChooser({ onPick }: { onPick: (name: string, gauge: VectorGauge) => void }) {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const list = useRef<HTMLDivElement>(null);
  // The chooser opens from a button: put the keyboard on its first gauge.
  useEffect(() => {
    if (items?.length) list.current?.querySelector<HTMLElement>("button")?.focus();
  }, [items]);
  useEffect(() => {
    listLibrary().then(
      (all) => setItems(all.filter((i) => i.kind === "gauge")),
      (e: Error) => {
        setItems([]);
        setError(e.message);
      },
    );
  }, []);
  const pick = (item: LibraryItem) =>
    void dataOf(item).then((raw) => {
      const spec = gaugeDataOf(raw)?.vector;
      if (spec) onPick(item.name, spec);
    }, () => toast(`Couldn’t read ${item.name}`));
  return (
    <div ref={list} className="ml-7.5 flex max-h-40 flex-col overflow-auto rounded-lg border border-ui-default bg-ui-panel">
      {items === null && <span className="p-2.5 text-caption text-ui-4">Reading…</span>}
      {items?.length === 0 && <span className="p-2.5 text-caption text-ui-4">{error ?? "No gauges in your library yet."}</span>}
      {items?.map((item) => (
        <button key={item.id} type="button" onClick={() => pick(item)} className="flex items-center gap-2 border-b border-ui-subtle px-2.5 py-2 text-left text-body text-ui-1 last:border-b-0 hover:bg-ui-hover">
          <Gauge className="h-3.5 w-3.5 shrink-0 text-ui-3" />
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
        </button>
      ))}
    </div>
  );
}

interface ExportSheetProps {
  open: boolean;
  request: ExportRequest;
  config: DashboardConfig;
  /** The screen being edited: "this screen" unless the request names another. */
  screen: MonitorProfile;
  pageName: string;
  /** The page's canvas zone (the selected one, else the first); undefined when the page has none. */
  pageCanvas: Placement | undefined;
  /** Open the page export dialog (its font choices live there). */
  onExportPage: () => void;
  onClose: () => void;
  toast: (message: string) => void;
}

/** The one Export & back up sheet (SPEC §9.2): four rows, each with its own Copy JSON. */
export function ExportSheet({ open, request, config, screen, pageName, pageCanvas, onExportPage, onClose, toast }: ExportSheetProps) {
  const [chosen, setChosen] = useState<{ name: string; gauge: VectorGauge } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (open) {
      setChosen(request.gauge ?? null);
      setChoosing(false);
      setCopied(null);
    }
  }, [open, request]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const target = config.profiles.find((p) => p.id === request.screenId) ?? screen;
  const backup = configPayload(config);
  // the screen's file carries its images (P5), read from the server while the sheet is open
  const [bundled, setBundled] = useState<Awaited<ReturnType<typeof bundledScreenPayload>> | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setBundled(null);
    void bundledScreenPayload(config, target).then((b) => alive && setBundled(b));
    return () => {
      alive = false;
    };
  }, [open, config, target]);
  const screenFile = bundled === null ? undefined : "error" in bundled ? bundled : bundled.payload;
  const leftOut = bundled && !("error" in bundled) && bundled.left ? ` · ${bundled.left === 1 ? "an image" : `${bundled.left} images`} left out, too large for the file` : "";
  const gauge = chosen ? gaugePayload(chosen.name, chosen.gauge) : undefined;
  const save = (payload: FilePayload | { error: string }, done: string) => {
    if ("error" in payload) return toast(payload.error);
    void saveFilePayload(payload).then((saved) => saved && toast(done));
  };
  const copiedRow = (row: string) => {
    setCopied(row);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 1500);
  };
  const common = { onCopied: copiedRow };
  const keep = (p: FilePayload | { error: string }) => ("error" in p ? undefined : p);

  return (
    <DialogParts.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogParts.Content
        layout="panel"
        data-help-article="import"
        className="flex max-h-[calc(100vh-48px)] w-[min(520px,calc(100vw-24px))] flex-col overflow-hidden rounded-ui-lg bg-ui-panel"
      >
        <div className="flex items-start gap-3 border-b border-ui-subtle px-5 pb-3.5 pt-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DialogParts.Title className="text-head font-medium text-ui-1">Export &amp; back up</DialogParts.Title>
            <DialogParts.Description className="text-body text-ui-3">Pick what to take out. Each one can also be copied as JSON.</DialogParts.Description>
          </div>
          <DialogParts.Close title="Close" aria-label="Close" className="grid h-8 w-8 place-items-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1">
            <X className="h-5 w-5" />
          </DialogParts.Close>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-5 py-4">
          <ExportRow
            {...common}
            id="backup"
            icon={Package}
            title="Back up everything"
            detail="All screens, themes, alerts and settings · .json"
            picked={request.row === "backup"}
            copy={keep(backup)}
            copied={copied === "backup"}
            actions={
              <button type="button" className={PRIMARY} onClick={() => save(backup, "Backup saved")}>
                Save backup
              </button>
            }
          />
          <ExportRow
            {...common}
            id="screen"
            icon={Monitor}
            title="Export this screen"
            detail={`${target.name} with its pages, images and own theme · .json`}
            picked={request.row === "screen"}
            copy={screenFile && keep(screenFile)}
            copied={copied === "screen"}
            actions={
              <button type="button" className={OUTLINE} disabled={!screenFile} onClick={() => screenFile && save(screenFile, `Exported ${target.name}${leftOut}`)}>
                Export screen
              </button>
            }
          />
          <ExportRow
            {...common}
            id="page"
            icon={FileOutput}
            title="Export a page"
            detail={`${pageName} as a stored .canvas.zip`}
            picked={request.row === "page"}
            blocked={pageCanvas ? undefined : "This page has no InfoPanel profile on it. Import an InfoPanel profile first, or open a page that has one."}
            copy={pageCanvas?.canvas ? { name: `${pageName}.canvas.json`, text: JSON.stringify(pageCanvas.canvas, null, 2) } : undefined}
            copied={copied === "page"}
            actions={
              <button
                type="button"
                className={OUTLINE}
                disabled={!pageCanvas}
                onClick={() => {
                  onClose();
                  onExportPage();
                }}
              >
                Export…
              </button>
            }
          >
            <p className="pl-7.5 text-micro text-ui-4">Fonts that may not be shared stay out unless you include them: you choose in the next step</p>
          </ExportRow>
          <ExportRow
            {...common}
            id="gauge"
            icon={Gauge}
            title="Export a gauge"
            detail={chosen ? `${chosen.name} · .gauge.json` : "Pick one from Gauges · .gauge.json"}
            picked={request.row === "gauge"}
            copy={gauge}
            copied={copied === "gauge"}
            actions={
              <>
                <button type="button" className={OUTLINE} aria-expanded={choosing} onClick={() => setChoosing((c) => !c)}>
                  {chosen ? "Choose another…" : "Choose…"}
                </button>
                {chosen && gauge && (
                  <button type="button" className={cn(PRIMARY, "flex items-center gap-1.5")} onClick={() => save(gauge, `Exported ${chosen.name}`)}>
                    <Download className="h-3.5 w-3.5" /> Export
                  </button>
                )}
              </>
            }
          >
            {choosing && (
              <GaugeChooser
                onPick={(name, spec) => {
                  setChosen({ name, gauge: spec });
                  setChoosing(false);
                }}
              />
            )}
          </ExportRow>
        </div>
      </DialogParts.Content>
    </DialogParts.Root>
  );
}
