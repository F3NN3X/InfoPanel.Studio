/**
 * The New wizards' shell (New screen on Screens, New InfoPanel profile on the InfoPanel home): a page in the studio's
 * main area, not a dialog, in two steps. 1 Start from: Blank, the templates and the other ways in. 2 Size and look: the
 * size, the palette, a name and a preview at that size. Create (or Enter) makes it; Back returns to step 1; Cancel or
 * Escape leaves without making anything. Each step's heading takes the focus, so the keyboard starts at the top.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const WIZARD_STEPS = ["Start from", "Size and look"] as const;

export type WizardStep = 0 | 1;

interface NewWizardProps {
  title: string;
  /** The Help article the page opens on. */
  helpArticle: string;
  step: WizardStep;
  onStep: (step: WizardStep) => void;
  onCancel: () => void;
  onCreate: () => void;
  /** Whether Create can make it now (a name and a whole size). */
  canCreate: boolean;
  /** Step 1: the gallery and the other ways in. */
  start: ReactNode;
  /** Step 2: the fields (size, colours, name), and the preview beside them. */
  fields: ReactNode;
  preview: ReactNode;
  /** A line under the fields: what Create does. */
  note?: ReactNode;
}

const PRIMARY = "h-8 rounded-[8px] bg-ui-accent px-4 text-[12.5px] font-medium text-ui-inverse-fg hover:opacity-90 disabled:opacity-40";
const OUTLINE = "h-8 rounded-[8px] border border-ui-strong px-3 text-[12.5px] text-ui-2 hover:bg-ui-hover hover:text-ui-1";

function Stepper({ step, onStep }: { step: WizardStep; onStep: (s: WizardStep) => void }) {
  return (
    <ol aria-label="Steps" className="m-0 flex list-none items-center gap-2 p-0">
      {WIZARD_STEPS.map((label, i) => (
        <li key={label} aria-current={i === step ? "step" : undefined} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="h-px w-5 bg-ui-default" />}
          <button
            type="button"
            disabled={i > step}
            onClick={() => onStep(i as WizardStep)}
            className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60 disabled:cursor-default"
          >
            <span
              className={cn(
                "grid h-5 w-5 place-items-center rounded-full border text-[11px] font-medium",
                i === step ? "border-ui-1 bg-ui-1 text-ui-inverse-fg" : i < step ? "border-ui-accent/60 text-ui-accent-text" : "border-ui-strong text-ui-4",
              )}
            >
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className={cn("text-[12px]", i === step ? "text-ui-1" : "text-ui-4")}>{label}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export function NewWizard({ title, helpArticle, step, onStep, onCancel, onCreate, canCreate, start, fields, preview, note }: NewWizardProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [step]);
  return (
    <form
      aria-label={title}
      data-help-article={helpArticle}
      className="flex min-h-0 flex-1 flex-col bg-ui-app font-ui text-ui-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (step === 0) onStep(1);
        else if (canCreate) onCreate();
      }}
      onKeyDown={(e) => {
        // Only keys from the page itself: a popup's Escape (a sensor list) closes the popup alone.
        if (e.key === "Escape" && !e.defaultPrevented && e.currentTarget.contains(e.target as Node)) {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-ui-subtle px-6 py-3.5">
        <h1 className="m-0 text-[15px] font-semibold">{title}</h1>
        <Stepper step={step} onStep={onStep} />
        <span className="flex-1" />
        <button type="button" aria-label="Close" title="Close (Esc)" onClick={onCancel} className="grid h-7 w-7 place-items-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1100px] px-6 py-5">
          <h2 ref={heading} tabIndex={-1} className="m-0 mb-3 text-[13px] font-semibold text-ui-1 outline-none">
            {WIZARD_STEPS[step]}
          </h2>
          {step === 0 ? (
            start
          ) : (
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="min-w-0 space-y-4">
                {fields}
                {note && <p className="text-[11.5px] leading-snug text-ui-4">{note}</p>}
              </div>
              <div className="min-w-0 lg:sticky lg:top-0">{preview}</div>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-ui-subtle px-6 py-3">
        <button type="button" onClick={onCancel} className="h-8 rounded-[8px] px-3 text-[12.5px] text-ui-3 hover:text-ui-1">
          Cancel
        </button>
        {step === 1 && (
          <button type="button" onClick={() => onStep(0)} className={OUTLINE}>
            Back
          </button>
        )}
        {step === 0 ? (
          <button type="submit" className={PRIMARY}>
            Next
          </button>
        ) : (
          <button type="submit" disabled={!canCreate} className={PRIMARY}>
            Create
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * Step 2's preview: what Create makes, in its own shape and no taller than the page leaves, with its size under it.
 * With `native`, the children are laid out at the full size and scaled down to the box (a live page); else they fill it.
 */
export function WizardPreview({ width, height, native, children }: { width: number; height: number; native?: boolean; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!native || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [native, width]);
  return (
    <figure aria-label="Preview" className="m-0">
      <div
        ref={box}
        className="relative mx-auto overflow-hidden rounded-[10px] border border-ui-default bg-[#0a0a0c]"
        style={{ aspectRatio: `${width} / ${height}`, width: `min(100%, calc(min(560px, 60vh) * ${width / height}))` }}
      >
        {native ? (
          scale > 0 && (
            <div className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ width, height, transform: `scale(${scale})` }}>
              {children}
            </div>
          )
        ) : (
          <div className="relative h-full w-full">{children}</div>
        )}
      </div>
      <figcaption className="mt-1.5 text-center font-ui-mono text-[11px] text-ui-4">
        {width} × {height}
      </figcaption>
    </figure>
  );
}

export interface OtherStart {
  id: string;
  icon: LucideIcon;
  title: string;
  note: string;
  onSelect: () => void;
}

/** Step 1's other ways in (the sample layout, an InfoPanel profile, Import): each starts at once, outside the wizard. */
export function OtherStarts({ items }: { items: readonly OtherStart[] }) {
  return (
    <div role="group" aria-label="Other ways to start" className="mt-5">
      <h3 className="mb-1.5 text-[12px] text-ui-3">Or start another way</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {items.map(({ id, icon: Icon, title, note, onSelect }) => (
          <button
            key={id}
            type="button"
            onClick={onSelect}
            className="flex items-start gap-2.5 rounded-[10px] border border-ui-default px-3 py-2.5 text-left outline-none hover:bg-ui-hover focus-visible:border-ui-accent"
          >
            <Icon className="mt-px h-[18px] w-[18px] shrink-0 text-ui-3" strokeWidth={1.75} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[12.5px] font-medium text-ui-1">{title}</span>
              <span className="text-[11.5px] leading-[1.4] text-ui-4">{note}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
