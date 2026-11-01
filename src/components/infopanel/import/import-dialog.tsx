/**
 * Import InfoPanel (§4): Source → Mode → Review → Sensors → Save. Review before commit: nothing
 * reaches the config until "Import <name>", which is one undo step; assets upload to the asset
 * store in the background from the moment a source opens.
 */
import { isProfileItem } from "@/lib/my-library/component-meta";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Check, FileArchive, FolderOpen, HardDrive, Library, Monitor, Upload } from "lucide-react";
import { formatBytes, uploadAsset } from "@/lib/assets";
import { getLibraryItem, listLibrary, type LibraryItem } from "@/lib/library";
import { readStoreFile } from "@/lib/infopanel/canvas";
import {
  folderEntries,
  installedEntries,
  INSTALLED_URL,
  openEntries,
  openStored,
  openZip,
  type InstalledProfile,
  type OpenedSource,
} from "@/lib/infopanel/import/session";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import { cn } from "@/lib/utils";
import { RemapPanel } from "../remap-panel";
import { ModeStep, Radio, ReviewStep, SaveStep, type Dest, type SaveChoices, type ShotState } from "./import-steps";
import { useImport, type ImportState } from "./use-import";

export interface ImportCommit {
  canvas: StoredCanvas;
  name: string;
  dest: Dest;
  /** The InfoPanel profile's size (a new profile is made this size). */
  size: { width: number; height: number };
  toLibrary: boolean;
  /** Asset store ids of the canvas's files (the library item's files). */
  files: string[];
}

export interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where "Canvas zone in …" lands: the profile on the canvas. */
  profileName: string;
  profileSize: { width: number; height: number };
  /** The Add panel's card opens with the canvas zone chosen. */
  initialDest?: Dest;
  /** Commit; resolves to an error to show (no room), or null when the import landed. */
  onImport: (commit: ImportCommit) => Promise<string | null>;
  /** Open with this source already chosen (the Import door: a file; the Library: a saved canvas). */
  initialSource?: ImportSource;
  /** The Import door already chose where it lands: the Save step has no "Lands in". */
  lockDest?: boolean;
}

/** A source the dialog opens with. */
/** A file to open, a Library canvas to reopen, or the list of profiles installed in InfoPanel to pick from. */
export type ImportSource = { file: File } | { canvasId: string; name?: string } | { installed: true };

const STEPS = ["Source", "Mode", "Review", "Sensors", "Save"] as const;
const TITLES = ["Choose a source", "How should it be drawn?", "Review before importing", "Fix sensors", "Save"];
const SUBTITLES = [
  "Nothing is lost on the way. Unknown fields are kept and exports go back to InfoPanel.",
  "Every item gets this mode in one undo step. You can switch any item later.",
  "Open any row for detail. Nothing is committed until Save.",
  "Profiles from another PC read other hardware. One choice fixes every item in a group.",
  "Choose where it lands.",
];
const MODE_LABEL = { infopanel: "Faithful", native: "Native where possible", both: "Both" };

type SourceKind = "file" | "installed" | "canvas";

const GHOST =
  "inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-ui-strong bg-ui-raised px-3 text-[12.5px] text-ui-1 transition-colors hover:bg-ui-hover";

const bytesOf = async (f: File) => new Uint8Array(await f.arrayBuffer());

interface Opening {
  label: string;
  size?: number;
  error?: string;
}

function SourceStep({
  kind,
  onKind,
  opening,
  state,
  onOpen,
}: {
  kind: SourceKind;
  onKind: (k: SourceKind) => void;
  opening: Opening | null;
  state: ImportState | null;
  onOpen: (label: string, size: number | undefined, work: () => Promise<OpenedSource>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const [installed, setInstalled] = useState<InstalledProfile[] | null>(null);
  const [canvases, setCanvases] = useState<LibraryItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    setListError(null);
    if (kind === "installed" && installed === null) {
      fetch(INSTALLED_URL, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<InstalledProfile[]>) : Promise.reject(new Error(`The server answered ${r.status}`))))
        .then(setInstalled, (e: Error) => {
          setInstalled([]);
          setListError(e.message);
        });
    }
    if (kind === "canvas" && canvases === null) {
      listLibrary().then(
        (all) => setCanvases(all.filter(isProfileItem)),
        (e: Error) => {
          setCanvases([]);
          setListError(e.message);
        },
      );
    }
  }, [kind, installed, canvases]);

  const openFile = (f: File) => onOpen(f.name, f.size, async () => openZip(f.name, await bytesOf(f)));
  const openFolder = (files: File[]) => {
    const size = files.reduce((n, f) => n + f.size, 0);
    onOpen(files[0]?.webkitRelativePath.split("/")[0] || "Folder", size, async () => {
      const { name, entries } = folderEntries(files.map((f) => ({ path: f.webkitRelativePath || f.name, read: () => bytesOf(f) })));
      return openEntries(name, entries, "file");
    });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    if (files.length === 1 && /\.(infopanel|zip)$/i.test(files[0].name)) openFile(files[0]);
  };

  const sources: { value: SourceKind; icon: typeof Upload; title: string; text: string }[] = [
    { value: "file", icon: Upload, title: "File or folder", text: ".infopanel, extracted folder or .canvas.zip" },
    { value: "installed", icon: Monitor, title: "Installed in InfoPanel", text: "Read-only from %LOCALAPPDATA%\\InfoPanel" },
    { value: "canvas", icon: Library, title: "Saved canvas", text: "Reopens with its mode, remap and fonts" },
  ];
  const upload = state?.upload;
  const pct = upload?.total ? Math.min(1, upload.done / upload.total) : upload?.finished ? 1 : 0;
  return (
    <div className="flex flex-col gap-4" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div role="radiogroup" aria-label="Source" className="grid grid-cols-3 gap-2.5 max-sm:grid-cols-1">
        {sources.map((s) => {
          const on = kind === s.value;
          const Icon = s.icon;
          return (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onKind(s.value)}
              className={cn(
                "flex flex-col gap-1.5 rounded-[10px] border p-3.5 text-left transition-colors",
                on ? "border-ui-accent bg-ui-accent-soft" : "border-ui-default bg-ui-tile hover:bg-ui-hover",
              )}
            >
              <Icon className={cn("h-[22px] w-[22px]", on ? "text-ui-accent" : "text-ui-3")} strokeWidth={1.75} />
              <span className="text-[13px] font-semibold text-ui-1">{s.title}</span>
              <span className="text-[11.5px] text-ui-4">{s.text}</span>
            </button>
          );
        })}
      </div>

      {opening && (
        <div className={cn("flex flex-col gap-2.5 rounded-[10px] border bg-ui-chrome p-3.5", opening.error ? "border-ui-danger" : "border-ui-default")}>
          <div className="flex items-center gap-2.5">
            <FileArchive className={cn("h-5 w-5", opening.error ? "text-ui-danger" : "text-ui-3")} />
            <span className="flex-1 truncate font-ui-mono text-[12.5px] text-ui-1">{opening.label}</span>
            {opening.size !== undefined && <span className="font-ui-mono text-[11.5px] text-ui-4">{formatBytes(opening.size)}</span>}
          </div>
          {opening.error ? (
            <span role="alert" className="whitespace-pre-wrap text-[12px] text-ui-danger">
              {opening.error}
            </span>
          ) : (
            <>
              <div className="h-1.5 overflow-hidden rounded-[3px] bg-ui-hover">
                <div
                  className={cn("h-full rounded-[3px] transition-[width]", upload?.finished ? "bg-ui-success" : "bg-ui-accent")}
                  style={{ width: `${(state ? pct : 0.05) * 100}%` }}
                />
              </div>
              <div className="flex text-[11.5px] text-ui-3">
                <span className="flex-1">
                  {!state
                    ? "Reading…"
                    : upload?.finished
                      ? `Read · ${state.report.items.total} items, ${state.source.assets.size} assets, ${state.report.fonts.requests} fonts${upload.failed.length ? ` · ${upload.failed.length} not stored` : ""}`
                      : `Uploading assets · ${formatBytes(upload?.done ?? 0)} of ${formatBytes(upload?.total ?? 0)}`}
                </span>
                {state && <span className="font-ui-mono">{Math.round(pct * 100)}%</span>}
              </div>
              {state?.source.restore && state.source.restore.missing.length > 0 && (
                <span className="text-[12px] text-ui-warning">Missing from the saved canvas: {state.source.restore.missing.join(", ")}</span>
              )}
            </>
          )}
        </div>
      )}

      {kind === "file" && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={GHOST} onClick={() => fileRef.current?.click()}>
            <FileArchive className="h-4 w-4" /> Choose file…
          </button>
          <button type="button" className={GHOST} onClick={() => folderRef.current?.click()}>
            <FolderOpen className="h-4 w-4" /> Choose folder…
          </button>
          <span className="text-[11.5px] text-ui-hint">Or drop an .infopanel or a .canvas.zip here.</span>
          <input
            ref={fileRef}
            type="file"
            accept=".infopanel,.zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) openFile(f);
              e.target.value = "";
            }}
          />
          <input
            ref={(el) => {
              folderRef.current = el;
              el?.setAttribute("webkitdirectory", "");
            }}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              if (files.length) openFolder(files);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {kind === "installed" && (
        <div className="flex flex-col overflow-hidden rounded-[10px] border border-ui-default">
          <div className="border-b border-ui-subtle bg-ui-chrome px-3 py-2 font-ui-mono text-[11px] text-ui-4">%LOCALAPPDATA%\InfoPanel\profiles · read-only</div>
          {installed === null && <span className="p-3 text-[12px] text-ui-4">Reading…</span>}
          {installed?.length === 0 && (
            <span className="p-3 text-[12px] text-ui-4">{listError ?? "No InfoPanel profiles on the PC running InfoPanel Studio (or InfoPanel keeps them elsewhere: set INFOPANEL_DATA_DIR on the server)."}</span>
          )}
          {installed?.map((p) => (
            <button
              key={p.guid}
              type="button"
              onClick={() => {
                setPicked(p.guid);
                onOpen(p.name, p.bytes, () => openEntries(p.name, installedEntries(p), "installed"));
              }}
              className={cn("flex items-center gap-3 border-b border-ui-subtle px-3 py-2.5 text-left last:border-b-0 hover:bg-ui-hover", picked === p.guid && "bg-ui-hover")}
            >
              <Radio on={picked === p.guid} />
              <span className="flex-1 truncate text-[12.5px] text-ui-1">{p.name || "(no name)"}</span>
              <span className="font-ui-mono text-[11px] text-ui-4">{p.assets.length === 1 ? "1 asset" : `${p.assets.length} assets`}</span>
              <span className="font-ui-mono text-[11px] text-ui-4">{formatBytes(p.bytes)}</span>
            </button>
          ))}
        </div>
      )}

      {kind === "canvas" && (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col overflow-hidden rounded-[10px] border border-ui-default">
            <div className="flex items-center gap-2 border-b border-ui-subtle bg-ui-chrome px-3 py-2 text-[11.5px] text-ui-4">
              <HardDrive className="h-3.5 w-3.5" /> My library · Imported canvases
            </div>
            {canvases === null && <span className="p-3 text-[12px] text-ui-4">Reading…</span>}
            {canvases?.length === 0 && <span className="p-3 text-[12px] text-ui-4">{listError ?? "No saved canvases yet."}</span>}
            {canvases?.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setPicked(c.id);
                  onOpen(c.name, c.dataSize, async () => openStored((await getLibraryItem<StoredCanvas>(c.id)).data, (h, e, t) => readStoreFile(h, e, t)));
                }}
                className={cn("flex items-center gap-3 border-b border-ui-subtle px-3 py-2.5 text-left last:border-b-0 hover:bg-ui-hover", picked === c.id && "bg-ui-hover")}
              >
                <Radio on={picked === c.id} />
                <span className="flex-1 truncate text-[12.5px] text-ui-1">{c.name}</span>
                <span className="font-ui-mono text-[11px] text-ui-4">{c.files.length === 1 ? "1 file" : `${c.files.length} files`}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={GHOST} onClick={() => zipRef.current?.click()}>
              <FileArchive className="h-4 w-4" /> Open a .canvas.zip…
            </button>
            <span className="text-[11.5px] text-ui-hint">Each file is checked against its SHA-256.</span>
            <input
              ref={zipRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) openFile(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ImportBody({ onClose, profileName, profileSize, initialDest = "new", onImport, initialSource, lockDest }: Omit<ImportDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<SourceKind>("file");
  const [opening, setOpening] = useState<Opening | null>(null);
  const [source, setSource] = useState<OpenedSource | null>(null);
  const [choices, setChoices] = useState<SaveChoices>({ name: "", dest: initialDest, toLibrary: false, keepShot: false });
  const [shotState, setShotState] = useState<ShotState>({ busy: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);
  const state = useImport(source);

  const open = (label: string, size: number | undefined, work: () => Promise<OpenedSource>) => {
    const id = ++run.current;
    setOpening({ label, size });
    setSource(null);
    work().then(
      (s) => {
        if (id !== run.current) return;
        setSource(s);
        const kept = s.restore?.screenshot;
        setChoices((c) => ({
          ...c,
          name: s.parsed.profile.Name || s.name,
          ...(kept ? { keepShot: true, shot: { name: "Saved with the canvas", id: kept } } : { keepShot: false, shot: undefined }),
        }));
      },
      (e: unknown) => id === run.current && setOpening({ label, size, error: e instanceof Error ? e.message : String(e) }),
    );
  };

  // A source handed over by the Library opens straight away.
  useEffect(() => {
    if (!initialSource) return;
    if ("installed" in initialSource) setKind("installed");
    else if ("file" in initialSource) {
      const f = initialSource.file;
      setKind("file");
      open(f.name, f.size, async () => openZip(f.name, await bytesOf(f)));
    } else {
      const id = initialSource.canvasId;
      setKind("canvas");
      open(initialSource.name ?? "Saved canvas", undefined, async () => openStored((await getLibraryItem<StoredCanvas>(id)).data, (h, e, t) => readStoreFile(h, e, t)));
    }
    // Once, on open.
  }, []);

  const pickShot = (file: File) => {
    setShotState({ busy: true });
    uploadAsset(file, "image").then(
      (a) => {
        setChoices((c) => ({ ...c, shot: { name: file.name, id: a.id } }));
        setShotState({ busy: false });
      },
      (e: unknown) => setShotState({ busy: false, error: e instanceof Error ? e.message : String(e) }),
    );
  };

  const uploading = !!state && !state.upload.finished;
  // Offline, every group is unresolved: the import goes on and the zone's Remap fixes them later.
  const sensorsBlocked = !!state && state.online && state.unresolved > 0;
  const canNext =
    step === 0 ? !!state && !uploading : step === 3 ? !sensorsBlocked : step === 4 ? !!state && !uploading && choices.name.trim() !== "" && !busy && !shotState.busy : true;

  const commit = async () => {
    if (!state) return;
    const name = choices.name.trim();
    setBusy(true);
    setError(null);
    const { profile } = state.source.parsed;
    const screenshot = choices.keepShot ? choices.shot?.id : undefined;
    const error = await onImport({
      canvas: state.build(name, screenshot),
      name,
      dest: choices.dest,
      size: { width: profile.Width, height: profile.Height },
      toLibrary: choices.toLibrary,
      files: [...new Set([...state.upload.ids.values(), ...(screenshot ? [screenshot] : [])])],
    }).catch((e: unknown) => (e instanceof Error ? e.message : String(e)));
    setBusy(false);
    setError(error);
    if (!error) onClose();
  };
  const next = () => {
    if (!canNext) return;
    if (step < 4) setStep(step + 1);
    else void commit();
  };

  const subs = [
    opening?.label ?? "Not chosen",
    state ? MODE_LABEL[state.mode] : "",
    state ? `${state.report.items.total} items` : "",
    state ? (state.online ? `${state.unresolved} unresolved` : "Data API offline") : "",
    choices.dest === "new" ? "New screen" : "A group",
  ];
  const footNote =
    step === 0 && uploading
      ? "Large assets keep uploading while you read"
      : step === 3 && sensorsBlocked
        ? `${state!.unresolved} groups need a sensor, or Leave unbound`
        : step === 3 && state && !state.online
          ? "The Data API is not reachable: sensors stay unresolved until you remap them from the page"
          : step === 4 && (busy || error)
            ? (error ?? "Importing…")
            : step === 4 && uploading
              ? `Uploading assets · ${formatBytes(state!.upload.done)} of ${formatBytes(state!.upload.total)}`
              : "";
  const nextLabel = step === 4 ? `Import ${choices.name.trim() || "screen"}` : step === 2 ? "Looks right, continue" : "Continue";

  return (
    // The remap step has its own Help article (F1).
    <div data-help-article={step === 3 ? "remap" : "import"} className="grid h-full grid-cols-[210px_minmax(0,1fr)] max-md:grid-cols-1">
      <nav aria-label="Import steps" className="flex flex-col gap-1 border-r border-ui-subtle bg-ui-chrome px-3 py-[18px] max-md:hidden">
        <Dialog.Title className="px-2 pb-0.5 text-[13.5px] font-semibold text-ui-1">Import InfoPanel</Dialog.Title>
        <span className="px-2 pb-3.5 text-[11.5px] text-ui-4">Review before commit</span>
        {STEPS.map((label, i) => {
          const done = i < step;
          const cur = i === step;
          return (
            <button
              key={label}
              type="button"
              disabled={!done}
              aria-current={cur ? "step" : undefined}
              onClick={() => done && setStep(i)}
              className={cn("flex items-center gap-2.5 rounded-lg p-2 text-left", cur && "bg-ui-hover", done && "hover:bg-ui-hover", i <= step ? "text-ui-1" : "text-ui-4")}
            >
              <span
                className={cn(
                  "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-[1.5px] font-ui-mono text-[11px] font-semibold",
                  done ? "border-transparent bg-ui-accent text-ui-inverse-fg" : cur ? "border-transparent bg-ui-inverse text-ui-inverse-fg" : "border-[#3a3a42] text-ui-4",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-px">
                <span className="text-[12.5px] font-medium">{label}</span>
                <span className="truncate text-[11px] text-ui-4">{i <= step ? subs[i] : ""}</span>
              </span>
            </button>
          );
        })}
      </nav>
      <div className="flex min-h-0 flex-col">
        <div className="flex flex-col gap-1 border-b border-ui-subtle px-[22px] pb-3.5 pt-[18px]">
          <span className="text-[16px] font-semibold text-ui-1">{TITLES[step]}</span>
          <Dialog.Description className="text-pretty text-[12.5px] text-ui-3">{step === 4 && lockDest ? "Name it, then import." : SUBTITLES[step]}</Dialog.Description>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-[22px] py-[18px]">
          {step === 0 && <SourceStep kind={kind} onKind={setKind} opening={opening} state={state} onOpen={open} />}
          {step === 1 && state && <ModeStep state={state} />}
          {step === 2 && state && <ReviewStep state={state} />}
          {step === 3 && state && (
            <RemapPanel groups={state.groups} resolved={state.resolved} index={state.index} overrides={state.overrides} onOverrides={state.setOverrides} />
          )}
          {step === 4 && state && (
            <SaveStep state={state} choices={choices} onChoices={setChoices} profileName={profileName} profileSize={profileSize} shotState={shotState} onPickShot={pickShot} lockDest={lockDest} />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2.5 border-t border-ui-subtle px-[22px] py-3">
          <button type="button" onClick={onClose} className="h-8 rounded-[7px] px-3 text-[12.5px] text-ui-3 hover:text-ui-1">
            Cancel
          </button>
          {footNote && <span className={cn("text-[11.5px]", step === 4 && error ? "text-ui-danger" : "text-ui-3")}>{footNote}</span>}
          <span className="flex-1" />
          {step > 0 && (
            <button type="button" className={GHOST} onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button
            type="button"
            disabled={!canNext}
            onClick={next}
            className="h-8 rounded-[7px] bg-ui-inverse px-4 text-[12.5px] font-semibold text-ui-inverse-fg disabled:cursor-not-allowed disabled:bg-ui-active disabled:text-ui-hint"
          >
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ImportDialog({ open, onOpenChange, ...body }: ImportDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 h-[min(640px,calc(100vh-48px))] w-[min(960px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[14px] border border-ui-strong bg-ui-panel font-ui text-ui-1 shadow-ui-modal outline-none">
          {open && <ImportBody {...body} onClose={() => onOpenChange(false)} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
