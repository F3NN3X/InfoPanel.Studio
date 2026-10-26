/**
 * The New wizard's shell (New screen and New InfoPanel profile, one page in the studio's main area, not a dialog): a
 * header with the title, the kind switch and what that kind is; the gallery beside a 460 px inspector; a footer with
 * the keys, Cancel and Create. Below 1100 px of main area it falls back to two steps, 1 Pick (the gallery) and 2 Adjust
 * (the inspector), with a stepper in the header and the selection summed up in the footer. Create (or Enter) makes it
 * from any state; Cancel or Escape leaves without making anything, unless something on the page handles Escape first
 * (a sensor list's popup, the expanded preview). Also here: the ways-in row, the preview box and its live scaling.
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowDown, ArrowLeftRight, ArrowUpRight, Check, LayoutGrid, Maximize2, PenTool, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardKind } from "./recent-templates";

/** The main area's width below which the page is two steps. */
export const NARROW_BELOW = 1100;

export type WizardStep = 0 | 1;

const STEPS = ["Pick", "Adjust"] as const;

export const KIND_TITLES: Record<WizardKind, string> = { screen: "New screen", ip: "New InfoPanel profile" };

export const KIND_SENTENCES: Record<WizardKind, string> = {
  screen: "A screen is a grid of native widgets with live data, served to your panels and editable on Screens.",
  ip: "A profile is free-placed elements on a canvas, edited in Edit and exportable to the InfoPanel app.",
};

const PRIMARY = "h-8 rounded-[8px] bg-ui-accent px-4 text-[12.5px] font-semibold text-ui-inverse-fg hover:opacity-90 disabled:opacity-40";
const OUTLINE = "h-8 rounded-[8px] border border-ui-strong px-3 text-[12.5px] text-ui-2 hover:bg-ui-hover hover:text-ui-1";

/** Whether the element is narrower than the wizard's two columns need. */
export function useNarrow<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => el.clientWidth > 0 && setNarrow(el.clientWidth < NARROW_BELOW));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, narrow];
}

function KindSwitch({ kind, onKind }: { kind: WizardKind; onKind: (k: WizardKind) => void }) {
  const kinds = [
    { k: "screen" as const, label: "Screen", icon: LayoutGrid },
    { k: "ip" as const, label: "InfoPanel profile", icon: PenTool },
  ];
  return (
    <div role="radiogroup" aria-label="What to make" className="flex shrink-0 rounded-[8px] border border-ui-default bg-ui-raised p-0.5">
      {kinds.map(({ k, label, icon: Icon }) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={kind === k}
          onClick={() => kind !== k && onKind(k)}
          className={cn("flex h-6 items-center gap-1.5 rounded-[6px] px-2.5 text-[12px]", kind === k ? "bg-ui-active text-ui-1" : "text-ui-3 hover:text-ui-1")}
        >
          <Icon className="h-[15px] w-[15px]" strokeWidth={1.75} />
          {label}
        </button>
      ))}
    </div>
  );
}

function Stepper({ step, onStep }: { step: WizardStep; onStep: (s: WizardStep) => void }) {
  return (
    <ol aria-label="Steps" className="m-0 flex shrink-0 list-none items-center gap-3 p-0">
      {STEPS.map((label, i) => (
        <li key={label} aria-current={i === step ? "step" : undefined}>
          <button type="button" onClick={() => onStep(i as WizardStep)} className="flex items-center gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60">
            <span
              className={cn(
                "grid h-5 w-5 place-items-center rounded-full border text-[11px] font-medium",
                i === step ? "border-ui-1 bg-ui-1 text-ui-inverse-fg" : "border-ui-strong text-ui-3",
              )}
            >
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className={cn("text-[12.5px]", i === step ? "text-ui-1" : "text-ui-3")}>{label}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

const Kbd = ({ children }: { children: ReactNode }) => <kbd className="rounded-[4px] border border-ui-default px-1 font-ui-mono text-[10.5px] text-ui-3">{children}</kbd>;

interface NewWizardProps {
  kind: WizardKind;
  onKind: (k: WizardKind) => void;
  /** The Help article the page opens on. */
  helpArticle: string;
  /** The page's own element: its width decides `narrow`. */
  formRef: RefObject<HTMLFormElement | null>;
  narrow: boolean;
  /** The narrow layout's step. */
  step: WizardStep;
  onStep: (step: WizardStep) => void;
  onCancel: () => void;
  onCreate: () => void;
  /** Whether Create can make it now (a name and a whole size). */
  canCreate: boolean;
  createLabel: string;
  gallery: ReactNode;
  inspector: ReactNode;
  /** The narrow footer's summary of the selection. */
  summary: ReactNode;
  /** Escape for the page itself first (the expanded preview): true when it took it. */
  onEscape?: () => boolean;
}

export function NewWizard(p: NewWizardProps) {
  const { kind, narrow, step } = p;
  const title = KIND_TITLES[kind];
  return (
    <form
      ref={p.formRef}
      aria-label={title}
      data-help-article={p.helpArticle}
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-ui-app font-ui text-[12.5px] text-ui-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (p.canCreate) p.onCreate();
      }}
      onKeyDown={(e) => {
        // Only keys from the page itself: a popup's Escape (a sensor list) closes the popup alone.
        if (e.key === "Escape" && !e.defaultPrevented && e.currentTarget.contains(e.target as Node)) {
          e.preventDefault();
          if (!p.onEscape?.()) p.onCancel();
        }
      }}
    >
      <div className="flex h-[52px] shrink-0 items-center gap-3.5 border-b border-ui-subtle pl-5 pr-4">
        <h1 className="m-0 shrink-0 text-[15px] font-semibold">{title}</h1>
        <KindSwitch kind={kind} onKind={p.onKind} />
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-ui-4">{narrow ? "" : KIND_SENTENCES[kind]}</span>
        {narrow && <Stepper step={step} onStep={p.onStep} />}
        <button type="button" aria-label="Close" title="Close (Esc)" onClick={p.onCancel} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        {(!narrow || step === 0) && <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">{p.gallery}</div>}
        {(!narrow || step === 1) && (
          <aside
            aria-label="Inspector"
            className={cn("min-h-0 overflow-y-auto bg-ui-panel", narrow ? "flex-1" : "w-[460px] shrink-0 border-l border-ui-subtle")}
          >
            <div className={cn("flex flex-col gap-3.5 p-4", narrow && "mx-auto max-w-[760px]")}>{p.inspector}</div>
          </aside>
        )}
      </div>
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-t border-ui-subtle px-5">
        {narrow ? (
          <div className="flex min-w-0 flex-1 items-baseline gap-2 truncate">{p.summary}</div>
        ) : (
          <p className="m-0 flex min-w-0 flex-1 items-center gap-1.5 truncate text-[11px] text-ui-4">
            <Kbd>←→</Kbd> browse <span className="w-2" />
            <Kbd>Enter</Kbd> create <span className="w-2" />
            Double-click a card to create it as shown
          </p>
        )}
        <button type="button" onClick={p.onCancel} className="h-8 rounded-[8px] px-3 text-[12.5px] text-ui-2 hover:text-ui-1">
          Cancel
        </button>
        {narrow && (
          <button type="button" onClick={() => p.onStep(step === 0 ? 1 : 0)} className={OUTLINE}>
            {step === 0 ? "Adjust size and look" : "Back"}
          </button>
        )}
        <button type="submit" disabled={!p.canCreate} className={PRIMARY}>
          {p.createLabel}
        </button>
      </div>
    </form>
  );
}

export interface WayIn {
  id: string;
  icon: LucideIcon;
  title: string;
  note: string;
  /** What it does: leaves the wizard, switches the kind, jumps to a section, or is Blank (a radio). */
  does: "leave" | "switch" | "jump" | "blank";
  onSelect: () => void;
  /** Blank only: whether it is the selection, and its double-click (create it). */
  checked?: boolean;
  onCreate?: () => void;
  disabled?: boolean;
}

const TRAIL: Record<Exclude<WayIn["does"], "blank">, LucideIcon> = { leave: ArrowUpRight, switch: ArrowLeftRight, jump: ArrowDown };

/** The ways in, pinned above the gallery: Blank (a radio, selected like a card) and the starts that don't use the gallery. */
export function WaysIn({ items }: { items: readonly WayIn[] }) {
  return (
    <div role="group" aria-label="Ways in" className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
      {items.map(({ id, icon: Icon, title, note, does, onSelect, checked, onCreate, disabled }) => {
        const Trail = does === "blank" ? null : TRAIL[does];
        return (
          <button
            key={id}
            type="button"
            role={does === "blank" ? "radio" : undefined}
            aria-checked={does === "blank" ? !!checked : undefined}
            disabled={disabled}
            onClick={onSelect}
            onDoubleClick={onCreate}
            onKeyDown={(e) => {
              if (does === "blank" && e.key === "Enter" && onCreate) {
                e.preventDefault();
                onSelect();
                onCreate();
              }
            }}
            className={cn(
              "flex h-11 min-w-0 items-center gap-2.5 rounded-[8px] border px-2.5 text-left outline-none focus-visible:border-ui-accent disabled:opacity-50",
              checked ? "border-ui-accent bg-ui-accent/10" : "border-ui-default bg-ui-raised enabled:hover:bg-ui-hover",
            )}
          >
            <span className={cn("grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[6px] border border-ui-strong bg-ui-app text-ui-2", does === "blank" && "border-dashed")}>
              <Icon className="h-[15px] w-[15px]" strokeWidth={1.75} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[12px] font-medium text-ui-1">{title}</span>
              <span className="truncate text-[11px] text-ui-3">{note}</span>
            </span>
            {Trail ? (
              <Trail aria-hidden className="h-3.5 w-3.5 shrink-0 text-ui-4" />
            ) : (
              <span aria-hidden className={cn("grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border", checked ? "border-ui-accent" : "border-ui-4")}>
                {checked && <span className="h-1.5 w-1.5 rounded-full bg-ui-accent" />}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Children laid out at the full size and scaled down to fill the box (a live page). */
export function Scaled({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={box} className="absolute inset-0 overflow-hidden">
      {scale > 0 && (
        <div className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ width, height, transform: `scale(${scale})` }}>
          {children}
        </div>
      )}
    </div>
  );
}

interface WizardPreviewProps {
  width: number;
  height: number;
  /** The most room it takes, in px. */
  max: { width: number; height: number };
  /** The physical panel the size is. */
  hint?: string;
  onExpand?: () => void;
  noData?: boolean;
  children: ReactNode;
}

/** The inspector's preview: what Create makes, fitted to its room at its own shape, with its size under it. */
export function WizardPreview({ width, height, max, hint, onExpand, noData, children }: WizardPreviewProps) {
  return (
    <figure aria-label="Preview" className="m-0 flex min-w-0 flex-col gap-1.5" style={{ width: `min(100%, ${max.width}px, ${(max.height * width) / height}px)` }}>
      <div className="relative w-full overflow-hidden rounded-[8px] border border-ui-strong bg-ui-app" style={{ aspectRatio: `${width} / ${height}` }}>
        {children}
        {noData && <NoDataPill />}
      </div>
      <figcaption className="flex min-w-0 items-center gap-2 text-[11px]">
        <span className="whitespace-nowrap font-ui-mono text-ui-2">
          {width} × {height}
        </span>
        {hint && <span className="min-w-0 flex-1 truncate text-ui-3">{hint}</span>}
        {!hint && <span className="flex-1" />}
        {onExpand && (
          <button type="button" aria-label="Expand the preview" title="Expand" onClick={onExpand} className="grid h-[22px] w-6 shrink-0 place-items-center rounded-[5px] text-ui-4 hover:bg-ui-hover hover:text-ui-1">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}
      </figcaption>
    </figure>
  );
}

export function NoDataPill() {
  return (
    <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1.5 rounded-full border border-ui-danger/40 bg-ui-app/90 px-2 py-0.5 text-[10.5px] text-ui-2">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ui-danger" />
      No live data · placeholders
    </span>
  );
}
