// The builder inspector's rows: a label on the left and its control on the right, as the mockup's Block, Options and Presets tabs
// lay them out, on the studio's chrome tokens. A text or number field holds what is typed as a draft and commits it on blur or Enter
// (the studio's `ValueBox`), so a word typed is one undo step; while it is typed the builder shows it on the stage (`Typing`), and
// Escape puts the value back. A slider commits when the drag ends, one step for the whole drag.
import { createContext, useContext, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { FOCUS_RING } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const INPUT = cn("h-8 min-w-0 rounded-ui-md border border-ui-strong bg-ui-app px-2.5 text-body text-ui-1 outline-none hover:border-ui-hover-edge focus:border-ui-accent", FOCUS_RING);

/**
 * How a field's draft reaches the stage before it commits: `preview` runs the field's own change as a preview (the builder shows
 * the recipe it makes, with no undo step), `cancel` drops it. Outside the builder a draft shows in its field only.
 */
export interface Typing {
  preview: (run: () => void) => void;
  cancel: () => void;
}
export const TypingContext = createContext<Typing>({ preview: () => {}, cancel: () => {} });

/**
 * A field's draft: `text` while it is edited (null when not), `type` for each keystroke, `done` on blur or Enter (commits `parse`'s
 * value when it differs from the one it started from: the value shown meanwhile is the preview's), `undo` on Escape.
 */
function useDraft<T>(value: T, show: (v: T) => string, parse: (s: string) => T | null, onChange: (v: T) => void) {
  const typing = useContext(TypingContext);
  const [text, setText] = useState<string | null>(null);
  const cancelled = useRef(false);
  const start = useRef(value);
  return {
    text: text ?? show(value),
    begin: () => {
      start.current = value;
      setText(show(value));
    },
    type: (s: string) => {
      setText(s);
      const v = parse(s);
      if (v !== null) typing.preview(() => onChange(v));
    },
    done: () => {
      const v = text === null || cancelled.current ? null : parse(text);
      cancelled.current = false;
      setText(null);
      if (v !== null && v !== start.current) onChange(v);
      else typing.cancel();
    },
    undo: (el: HTMLElement) => {
      cancelled.current = true;
      el.blur();
    },
  };
}

/** A labelled row: the label, then the control at the right. */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <span className="min-w-0 truncate text-body text-ui-2" title={hint}>
        {label}
      </span>
      <div className="flex min-w-0 shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/** A section's small heading ("Data", "Look"). */
export function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mt-2 text-caption text-ui-3">{children}</h3>;
}

/** Enter commits (blur), Escape puts the value back. */
const keys = (draft: { undo: (el: HTMLInputElement) => void }) => (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") e.currentTarget.blur();
  else if (e.key === "Escape") {
    e.stopPropagation();
    draft.undo(e.currentTarget);
  }
};

/** A number field; empty is "not set", and `placeholder` says what that draws. A bad entry keeps the last value. */
export function NumberInput({ label, value, onChange, unit, min, max, step, width = 72, placeholder }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; unit?: string; min?: number; max?: number; step?: number; width?: number; placeholder?: string }) {
  const draft = useDraft<number | undefined>(
    value,
    (v) => (v === undefined ? "" : String(v)),
    (s) => (s.trim() === "" ? undefined : Number.isFinite(Number(s)) ? Number(s) : null),
    onChange,
  );
  return (
    <span className="relative flex items-center">
      <input
        aria-label={label}
        type="number"
        value={draft.text}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        onFocus={draft.begin}
        onChange={(e) => draft.type(e.target.value)}
        onBlur={draft.done}
        onKeyDown={keys(draft)}
        className={cn(INPUT, "font-ui-mono", unit && "pr-7")}
        style={{ width }}
      />
      {unit && <span className="pointer-events-none absolute right-2 font-ui-mono text-micro text-ui-3">{unit}</span>}
    </span>
  );
}

/** A text field. `onChange` gets what was typed when it commits; what it keeps of it (cut, or the old value for an empty one) is the caller's. */
export function TextInput({ label, value, onChange, width = 160, placeholder }: { label: string; value: string; onChange: (v: string) => void; width?: number; placeholder?: string }) {
  const draft = useDraft(value, (v) => v, (s) => s, onChange);
  return <input aria-label={label} value={draft.text} placeholder={placeholder} onFocus={draft.begin} onChange={(e) => draft.type(e.target.value)} onBlur={draft.done} onKeyDown={keys(draft)} className={INPUT} style={{ width }} />;
}

/** A text of a few lines (a description), committed as `TextInput` is: on blur or Enter (a description is one paragraph). */
export function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const draft = useDraft(value, (v) => v, (s) => s.replace(/\s*\n\s*/g, " "), onChange);
  return (
    <textarea
      aria-label={label}
      value={draft.text}
      placeholder={placeholder}
      rows={3}
      onFocus={draft.begin}
      onChange={(e) => draft.type(e.target.value)}
      onBlur={draft.done}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.stopPropagation();
          draft.undo(e.currentTarget);
        }
      }}
      className={cn(INPUT, "h-auto resize-none py-1.5 leading-snug")}
    />
  );
}

/** A range slider: the stage follows the drag, and the drag is one step, committed when it ends (pointer up, a key let go, blur). */
export function Slider({ label, value, min, max, onChange, className }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; className?: string }) {
  const draft = useDraft(value, String, (s) => (Number.isFinite(Number(s)) ? Number(s) : null), onChange);
  return <input aria-label={label} type="range" min={min} max={max} value={draft.text} onPointerDown={draft.begin} onFocus={draft.begin} onChange={(e) => draft.type(e.target.value)} onPointerUp={draft.done} onKeyUp={draft.done} onBlur={draft.done} className={className} />;
}

export function Select<T extends string>({ label, value, options, onChange, width = 160 }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; width?: number }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)} className={cn(INPUT, "pr-6")} style={{ width }}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
