import { useRef } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { FileArchive, FileJson, FileQuestion, Film, Gauge, ImageIcon, Monitor, Type, Upload, X, type LucideIcon } from "lucide-react";
import { destinationsOf, type Destination, type DestinationId, type ImportKind } from "@/lib/import-sniff";
import { cn } from "@/lib/utils";
import type { DoorChoices, DoorFile } from "./import-door-actions";
import { openNewInfoPanel } from "./file-doors";

const KIND_ICON: Record<ImportKind, LucideIcon> = {
  config: FileJson,
  profile: Monitor,
  infopanel: FileArchive,
  "canvas-zip": FileArchive,
  gauge: Gauge,
  "gauge-svg": Gauge,
  "frames-zip": FileArchive,
  image: ImageIcon,
  video: Film,
  font: Type,
  "fonts-zip": Type,
  unknown: FileQuestion,
};

/** What happens after the import, for the footer. */
const NEXT: Record<ImportKind, string> = {
  config: "Then your dashboard is restored. Undo brings the old one back.",
  profile: "Then it opens Screens.",
  infopanel: "Then the import wizard: Faithful / Native / Both, Review, Sensors, Save.",
  "canvas-zip": "Then the import wizard: Faithful / Native / Both, Review, Sensors, Save.",
  gauge: "Then it opens the gauge.",
  "gauge-svg": "Then it opens the gauge.",
  "frames-zip": "Then it opens the gauge.",
  image: "Then it opens Library › Media.",
  video: "Then it opens Library › Media.",
  font: "Then it opens Library › Fonts.",
  "fonts-zip": "Then it opens Library › Fonts.",
  unknown: "",
};

/** The choice a destination group makes: one of the door's three radio sets. */
type Group = { key: string; title: string; kinds: ImportKind[]; files: DoorFile[]; destinations: Destination[]; choice?: "config" | "canvas" };

/** Detected files by where they go: one group per destination set, in the order the files came. */
export function groupsOf(files: readonly DoorFile[], current: { screen: string; page: string }): Group[] {
  const groups: Group[] = [];
  for (const f of files) {
    const kind = f.sniffed?.kind;
    if (!kind || kind === "unknown") continue;
    const destinations = destinationsOf(kind, current);
    const choice = kind === "config" ? "config" : kind === "infopanel" || kind === "canvas-zip" ? "canvas" : undefined;
    const key = choice ?? destinations[0].title;
    const at = groups.find((g) => g.key === key);
    if (at) {
      at.files.push(f);
      if (!at.kinds.includes(kind)) at.kinds.push(kind);
    } else groups.push({ key, title: destinations[0].title, kinds: [kind], files: [f], destinations, choice });
  }
  return groups;
}

function RadioDot({ on }: { on: boolean }) {
  return (
    <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-full border-[1.5px]", on ? "border-ui-accent" : "border-[#3a3a42]")}>
      {on && <span className="h-2 w-2 rounded-full bg-ui-accent" />}
    </span>
  );
}

function FileRow({ file, onRemove }: { file: DoorFile; onRemove: () => void }) {
  const s = file.sniffed;
  const Icon = KIND_ICON[s?.kind ?? "unknown"];
  const bad = s?.kind === "unknown";
  return (
    <li className="flex items-center gap-2.5 py-2">
      <Icon className={cn("h-[18px] w-[18px] shrink-0", bad ? "text-ui-danger" : "text-ui-3")} strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate font-ui-mono text-[12.5px] text-ui-1">{file.file.name}</span>
      <span className={cn("shrink-0 text-[12px]", !s ? "text-ui-4" : bad ? "text-ui-danger" : "text-ui-success")} role={bad ? "alert" : undefined}>
        {!s ? "Reading…" : bad ? s.label : `Detected: ${s.label}`}
      </span>
      <button type="button" aria-label={`Remove ${file.file.name}`} onClick={onRemove} className="grid h-5 w-5 shrink-0 place-items-center rounded text-ui-4 hover:bg-ui-hover hover:text-ui-1">
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function DestinationCards({ group, value, onPick }: { group: Group; value: DestinationId; onPick: (id: DestinationId) => void }) {
  return (
    <div role="radiogroup" aria-label={`Destination: ${group.title}`} className="flex flex-col gap-2">
      {group.destinations.map((d) => {
        const on = d.id === value || group.destinations.length === 1;
        return (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(d.id)}
            className={cn("flex items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-left transition-colors", on ? "border-ui-accent bg-ui-accent-soft" : "border-ui-default bg-ui-chrome hover:bg-ui-hover")}
          >
            <RadioDot on={on} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-medium text-ui-1">{d.title}</span>
              <span className="text-[12px] text-ui-4">{d.text}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface ImportDoorDialogProps {
  open: boolean;
  files: readonly DoorFile[];
  choices: DoorChoices;
  onChoices: (next: DoorChoices) => void;
  busy: boolean;
  /** The edited screen and page: the canvas zone's destination and the background checkbox name them. */
  current: { screen: string; page: string };
  onAdd: (files: File[]) => void;
  onRemove: (id: number) => void;
  onClose: () => void;
  onRun: () => void;
  /** Pick a profile installed in InfoPanel on this PC (the wizard's Installed source). */
  onInstalled: () => void;
}

/** The one Import dialog (SPEC §9.1): the files it detected, where each goes, the options, then the primary action. */
export function ImportDoorDialog({ open, files, choices, onChoices, busy, current, onAdd, onRemove, onClose, onRun, onInstalled }: ImportDoorDialogProps) {
  const input = useRef<HTMLInputElement>(null);
  const groups = groupsOf(files, current);
  const pending = files.some((f) => !f.sniffed);
  const ready = groups.length > 0 && !pending && !busy;
  const media = files.find((f) => f.sniffed?.kind === "image" || f.sniffed?.kind === "video");
  const replacing = groups.some((g) => g.choice === "config") && choices.config === "replace";
  const onlyConfig = groups.length === 1 && groups[0].choice === "config";
  const hint = groups[0] ? NEXT[groups[0].kinds[0]] : "Drop files anywhere in Studio, or choose them here.";
  const pick = (g: Group, id: DestinationId) => {
    if (g.choice === "config") onChoices({ ...choices, config: id === "add-screens" ? "add-screens" : "replace" });
    else if (g.choice === "canvas") onChoices({ ...choices, canvas: id === "canvas-zone" ? "canvas-zone" : "new-screen" });
  };
  const valueOf = (g: Group): DestinationId => (g.choice === "config" ? choices.config : g.choice === "canvas" ? choices.canvas : g.destinations[0].id);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Popup
          data-help-article="import"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-48px)] w-[min(560px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[12px] border border-ui-strong bg-ui-panel font-ui text-ui-1 shadow-ui-modal outline-none"
        >
          <div className="flex flex-col gap-1 border-b border-ui-subtle px-5 pb-3.5 pt-4">
            <Dialog.Title className="text-[16px] font-semibold text-ui-1">Import</Dialog.Title>
            <Dialog.Description className="text-pretty text-[12.5px] text-ui-3">
              One door for every file. Drop it anywhere in Studio, or choose a file — we work out what it is.
            </Dialog.Description>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 py-4">
            {files.length === 0 ? (
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-ui-strong text-center text-ui-3 hover:border-ui-accent hover:text-ui-1"
              >
                <Upload className="h-6 w-6" strokeWidth={1.5} />
                <span className="text-[12.5px]">Drop files here, or choose them</span>
                <span className="text-[11px] text-ui-4">Config backups, screens, .infopanel, gauges, images, videos, fonts</span>
              </button>
            ) : null}
            {files.length === 0 && (
              <div className="-mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <button type="button" onClick={onInstalled} className="text-[12px] text-ui-accent-text hover:underline">
                  From InfoPanel on this PC…
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    openNewInfoPanel();
                  }}
                  className="text-[12px] text-ui-accent-text hover:underline"
                >
                  No file? New InfoPanel profile…
                </button>
              </div>
            )}
            {files.length === 0 ? null : (
              <section aria-label="Detected" className="rounded-[10px] border border-ui-default bg-ui-chrome px-3.5 py-1.5">
                <ul className="divide-y divide-ui-subtle">
                  {files.map((f) => (
                    <FileRow key={f.id} file={f} onRemove={() => onRemove(f.id)} />
                  ))}
                </ul>
                <button type="button" onClick={() => input.current?.click()} className="mb-1 mt-0.5 text-[12px] text-ui-accent-text hover:underline">
                  Add more files…
                </button>
              </section>
            )}
            {groups.map((g) => (
              <section key={g.key} className="flex flex-col gap-2">
                <span className="text-[12px] text-ui-3">
                  Destination{groups.length > 1 ? ` · ${g.files.length === 1 ? g.files[0].file.name : `${g.files.length} files`}` : ""}
                </span>
                <DestinationCards group={g} value={valueOf(g)} onPick={(id) => pick(g, id)} />
              </section>
            ))}
            {replacing && (
              <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] text-ui-2">
                <input
                  type="checkbox"
                  checked={choices.backupFirst}
                  onChange={(e) => onChoices({ ...choices, backupFirst: e.target.checked })}
                  className="h-4 w-4 accent-[var(--ui-accent)]"
                />
                Back up the current dashboard first (recommended)
              </label>
            )}
            {media && (
              <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] text-ui-2">
                <input
                  type="checkbox"
                  checked={choices.asBackground}
                  onChange={(e) => onChoices({ ...choices, asBackground: e.target.checked })}
                  className="h-4 w-4 accent-[var(--ui-accent)]"
                />
                <span className="min-w-0 truncate">
                  Also use {media.file.name} as the background for {current.screen}
                </span>
              </label>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2.5 border-t border-ui-subtle px-5 py-3">
            <span className="min-w-0 flex-1 text-pretty text-[11.5px] text-ui-3">{hint}</span>
            <button type="button" onClick={onClose} className="h-8 rounded-[7px] px-3 text-[12.5px] text-ui-3 hover:text-ui-1">
              Cancel
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={onRun}
              className="h-8 rounded-[7px] bg-ui-inverse px-4 text-[12.5px] font-semibold text-ui-inverse-fg disabled:cursor-not-allowed disabled:bg-ui-active disabled:text-ui-hint"
            >
              {busy ? "Importing…" : onlyConfig && replacing ? "Restore" : "Import"}
            </button>
          </div>
          <input
            ref={input}
            type="file"
            multiple
            aria-label="Choose files to import"
            className="hidden"
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])];
              e.target.value = "";
              if (picked.length) onAdd(picked);
            }}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The full-window "Drop to import" cover shown while a file is dragged over Studio. It never takes the drop itself. */
export function DropOverlay() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-black/60 p-6 font-ui">
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-ui-accent bg-ui-accent-soft">
        <Upload className="h-8 w-8 text-ui-accent-text" strokeWidth={1.5} />
        <span className="text-[18px] font-semibold text-ui-1">Drop to import</span>
        <span className="text-[12.5px] text-ui-3">We work out what each file is</span>
      </div>
    </div>
  );
}
