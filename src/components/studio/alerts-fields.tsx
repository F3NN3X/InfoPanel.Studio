import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ALERT_POSITIONS, type AlertPosition, type Severity } from "@/lib/alerts";
import { cn } from "@/lib/utils";
import { FIELD } from "./setting-rows";

/** The Alerts panel's controls that the inspector's field rows (`setting-rows`) do not have. */

const DOT: Record<Severity, string> = {
  info: "bg-ui-accent",
  warning: "bg-ui-warning",
  critical: "bg-ui-danger",
};

export function SeverityDot({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      role="img"
      aria-label={severity}
      title={severity}
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", DOT[severity], className)}
    />
  );
}

const parse = (text: string): number | undefined => {
  if (text.trim() === "") return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
};

interface NumFieldProps {
  value: number | undefined;
  /** undefined = the field was emptied. */
  onChange: (value: number | undefined) => void;
  label: string;
  min?: number;
  max?: number;
  placeholder?: string;
}

/** A number input that keeps what is typed until it parses (so "-" or "1." can be typed). */
export function NumField({ value, onChange, label, min, max, placeholder }: NumFieldProps) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  // Undo / redo or another edit changed the value behind the text.
  useEffect(() => {
    setText((t) => (parse(t) === value ? t : value === undefined ? "" : String(value)));
  }, [value]);
  return (
    <input
      type="number"
      inputMode="decimal"
      value={text}
      aria-label={label}
      min={min}
      max={max}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        const n = parse(e.target.value);
        if (n !== undefined || e.target.value.trim() === "") onChange(n);
      }}
      className={cn(FIELD, "h-[26px] w-[64px] shrink-0 px-1.5 text-right font-ui-mono text-[11.5px]")}
    />
  );
}

/** A text input. */
export function TextField({
  value,
  onChange,
  label,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      aria-label={label}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      className={cn(FIELD, "h-[30px] w-full", mono && "font-ui-mono text-[11.5px]")}
    />
  );
}

interface ChipsFieldProps {
  values: string[];
  onChange: (values: string[]) => void;
  label: string;
  placeholder?: string;
  /** Offered while typing (a datalist); free text is always allowed. */
  suggestions?: readonly string[];
}

/** A multi-entry text field: Enter or a comma adds a chip, the chip's x removes it. */
export function ChipsField({ values, onChange, label, placeholder, suggestions = [] }: ChipsFieldProps) {
  const [draft, setDraft] = useState("");
  const listId = `chips-${label.replace(/\W+/g, "-").toLowerCase()}`;
  const add = () => {
    const next = draft.trim();
    setDraft("");
    if (next && !values.some((v) => v.toLowerCase() === next.toLowerCase())) onChange([...values, next]);
  };
  return (
    <div className="space-y-1.5">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map((v) => (
            <span key={v} className="flex items-center gap-1 rounded-md bg-ui-active px-1.5 py-0.5 text-[11.5px] text-ui-1">
              {v}
              <button
                type="button"
                aria-label={`Remove ${v}`}
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="text-ui-4 hover:text-ui-danger"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={draft}
        aria-label={label}
        placeholder={placeholder}
        list={suggestions.length > 0 ? listId : undefined}
        onChange={(e) => setDraft(e.target.value.replace(",", ""))}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        className={cn(FIELD, "h-[30px] w-full")}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}

/** The 3×3 position picker. */
export function PositionGrid({ value, onChange }: { value: AlertPosition; onChange: (value: AlertPosition) => void }) {
  return (
    <div role="radiogroup" aria-label="Position" className="grid w-[84px] grid-cols-3 gap-0.5 rounded-md border border-ui-default bg-ui-app p-0.5">
      {ALERT_POSITIONS.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={p === value}
          aria-label={p}
          title={p}
          onClick={() => onChange(p)}
          className={cn("h-[22px] rounded-[4px] transition-colors", p === value ? "bg-ui-accent" : "bg-ui-hover hover:bg-ui-active")}
        />
      ))}
    </div>
  );
}

/** The note under an alert display set to the island style. */
export const ISLAND_HINT =
  "Shows in the profile's Dynamic Island (Dashboard › Profile); a profile without one shows it as a top toast.";
