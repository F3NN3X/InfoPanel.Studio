import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
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
import { screenPayload } from "./profile-file";

type Row = NonNullable<ExportRequest["row"]>;

const PRIMARY = "h-7 shrink-0 rounded-[7px] bg-ui-inverse px-3 text-[12.5px] font-semibold text-ui-inverse-fg hover:opacity-90 disabled:cursor-not-allowed disabled:bg-ui-active disabled:text-ui-hint";
const OUTLINE = "h-7 shrink-0 rounded-[7px] border border-ui-strong px-3 text-[12.5px] font-medium text-ui-2 hover:bg-ui-hover hover:text-ui-1 disabled:cursor-not-allowed disabled:opacity-40";

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
    <section aria-label={title} className={cn("flex flex-col gap-2 rounded-[10px] border px-3.5 py-3", picked ? "border-ui-accent bg-ui-accent-soft" : "border-ui-default bg-ui-chrome")}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-ui-3" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <div className="text-body font-semibold text-ui-1">{title}</div>
          <div className="text-pretty text-caption text-ui-4">{detail}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
      {blocked ? <p className="pl-[30px] text-[11.5px] text-ui-warning">{blocked}</p> : children}
      <div className="pl-[30px]">
        <button
          type="button"
          disabled={!copy}
          onClick={() => copy && void copyPayload(copy).then(() => onCopied(id), () => toast("Couldn’t copy the JSON"))}
          className="flex items-center gap-1 text-[11.5px] text-ui-accent-text hover:underline disabled:cursor-not-allowed disabled:text-ui-hint disabled:no-underline"
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
    <div ref={list} className="ml-[30px] flex max-h-40 flex-col overflow-auto rounded-lg border border-ui-default bg-ui-panel">
      {items === null && <span className="p-2.5 text-caption text-ui-4">Reading…</span>}
      {items?.length === 0 && <span className="p-2.5 text-caption text-ui-4">{error ?? "No gauges in your library yet."}</span>}
      {items?.map((item) => (
        <button key={item.id} type="button" onClick={() => pick(item)} className="flex items-center gap-2 border-b border-ui-subtle px-2.5 py-2 text-left text-[12.5px] text-ui-1 last:border-b-0 hover:bg-ui-hover">
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
  /** Open the InfoPanel export dialog (its options live there). */
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
  const screenFile = screenPayload(config, target);
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
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Popup
          data-help-article="import"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-48px)] w-[min(520px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-ui-lg border border-ui-strong bg-ui-panel font-ui text-ui-1 shadow-ui-modal outline-none"
        >
          <div className="flex items-start gap-3 border-b border-ui-subtle px-5 pb-3.5 pt-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Dialog.Title className="text-[16px] font-semibold text-ui-1">Export &amp; back up</Dialog.Title>
              <Dialog.Description className="text-[12.5px] text-ui-3">Pick what to take out. Each one can also be copied as JSON.</Dialog.Description>
            </div>
            <Dialog.Close title="Close" aria-label="Close" className="grid h-8 w-8 place-items-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1">
              <X className="h-5 w-5" />
            </Dialog.Close>
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
              detail={`${target.name} with its pages and own look · .json`}
              picked={request.row === "screen"}
              copy={keep(screenFile)}
              copied={copied === "screen"}
              actions={
                <button type="button" className={OUTLINE} onClick={() => save(screenFile, `Exported ${target.name}`)}>
                  Export screen
                </button>
              }
            />
            <ExportRow
              {...common}
              id="page"
              icon={FileOutput}
              title="Export a page for InfoPanel"
              detail={`${pageName} as an .infopanel canvas`}
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
              <p className="pl-[30px] text-[11.5px] text-ui-4">Bake gauges and elements first · Leave unused assets out · Stored form or .infopanel: you choose them in the next step.</p>
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
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
