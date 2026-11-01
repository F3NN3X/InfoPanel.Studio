import type { ReactNode } from "react";
import { Ban, Copy, Hash, Link2, List, ToggleRight, Type, type LucideIcon } from "lucide-react";
import type { Health, PointType } from "@/lib/data-points";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<PointType, LucideIcon> = {
  number: Hash,
  text: Type,
  list: List,
  url: Link2,
  bool: ToggleRight,
  empty: Ban,
};

export function TypeIcon({ type, className }: { type: PointType; className?: string }) {
  const Icon = TYPE_ICON[type];
  return <Icon className={cn("h-[13px] w-[13px] shrink-0 text-ui-4", className)} aria-hidden />;
}

export const HEALTH_LABEL: Record<Health, string> = {
  ok: "healthy",
  warn: "no data",
  off: "offline",
};

const HEALTH_COLOR: Record<Health, string> = {
  ok: "bg-ui-success",
  warn: "bg-ui-warning",
  off: "bg-[#5a5a63]",
};

export function StatusDot({ health, className }: { health: Health; className?: string }) {
  return (
    <span
      role="img"
      aria-label={HEALTH_LABEL[health]}
      title={HEALTH_LABEL[health]}
      className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", HEALTH_COLOR[health], className)}
    />
  );
}

/** A small borderless tag (the unit kind: "Temp"); pass a className for the larger value-card chips. */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-lg bg-[#1e1e24] px-1.5 py-px font-ui text-[10px] text-[#a4a4ad]",
        className
      )}
    >
      {children}
    </span>
  );
}

interface ToggleChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

/** A filter chip: pressed = on. */
export function ToggleChip({ active, onClick, children }: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-[5px] rounded-full border px-2.5 font-ui text-[11.5px] transition-colors",
        active
          ? "border-ui-accent/50 bg-ui-accent-soft text-ui-1"
          : "border-ui-strong text-[#a4a4ad] hover:bg-ui-hover hover:text-ui-1"
      )}
    >
      {children}
    </button>
  );
}

/** Uppercase section caption: tree categories and table column heads. */
export const CAPTION = "font-ui text-[10.5px] font-medium uppercase tracking-[0.05em] text-ui-hint";

/** The small label above an inspector field. */
export const FIELD_LABEL = "font-ui text-[11.5px] leading-[1.25] text-ui-4";

interface CopyFieldProps {
  label: string;
  /** What is copied. */
  value: string;
  /** What is shown when it differs from `value` (a path for a copied URL). */
  display?: string;
  /** Shows a green GET before the text. */
  get?: boolean;
  onCopy: (text: string) => void;
}

/** A labelled field that copies its value when clicked; long text wraps. */
export function CopyField({ label, value, display, get, onCopy }: CopyFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={FIELD_LABEL}>{label}</span>
      <button
        type="button"
        title="Copy"
        aria-label={`Copy ${label.toLowerCase()}`}
        onClick={() => onCopy(value)}
        className="flex items-center gap-2 rounded-[7px] border border-ui-default bg-ui-app px-2.5 py-2 text-left text-ui-1 transition-colors hover:border-[#3a3a44]"
      >
        <span className="min-w-0 flex-1 break-all font-ui-mono text-[11px] leading-[1.3]">
          {get && <span className="text-ui-success">GET </span>}
          {display ?? value}
        </span>
        <Copy className="h-[15px] w-[15px] shrink-0 text-ui-4" />
      </button>
    </div>
  );
}
