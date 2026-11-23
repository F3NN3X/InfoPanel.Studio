import type { ReactNode } from "react";
import { Ban, Copy, Hash, Image, Link2, List, ToggleRight, Type, type LucideIcon } from "lucide-react";
import { FOCUS_RING } from "@/components/ui/button";
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

/** A point's type icon; a link that points at an image takes the picture icon. */
export function TypeIcon({ type, image, className }: { type: PointType; image?: boolean; className?: string }) {
  const Icon = image ? Image : TYPE_ICON[type];
  return <Icon className={cn("h-3.25 w-3.25 shrink-0 text-ui-4", className)} aria-hidden />;
}

export const HEALTH_LABEL: Record<Health, string> = {
  ok: "healthy",
  warn: "no data",
  off: "offline",
};

const HEALTH_COLOR: Record<Health, string> = {
  ok: "rounded-full bg-ui-ok",
  warn: "rotate-45 rounded-[1px] bg-ui-warn",
  off: "rounded-full border border-ui-hint",
};

export function StatusDot({ health, className }: { health: Health; className?: string }) {
  return (
    <span
      role="img"
      aria-label={HEALTH_LABEL[health]}
      title={HEALTH_LABEL[health]}
      className={cn("inline-block h-1.5 w-1.5 shrink-0", HEALTH_COLOR[health], className)}
    />
  );
}

/** A small borderless tag (the unit kind: "Temp"); pass a className for the larger value-card chips. */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-lg bg-s-nav-on px-1.5 py-px font-ui text-nano text-ui-soft",
        className
      )}
    >
      {children}
    </span>
  );
}

/** A group's label in the filters column and the detail pane: 12 px, medium, muted, sentence case. */
export const GROUP_LABEL = "font-ui text-caption font-medium text-ui-3";

/** The small label above a detail field. */
export const FIELD_LABEL = "font-ui text-caption text-ui-3";

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
        className={cn("flex items-center gap-2 rounded-ui-md border border-ui-control bg-ui-chrome px-3 py-2 text-left text-ui-1 transition-colors duration-(--ui-dur-fast) ease-ui hover:border-ui-hover-edge", FOCUS_RING)}
      >
        <span className="min-w-0 flex-1 break-all font-ui-mono text-caption leading-[1.35]">
          {get && <span className="text-ui-3">GET </span>}
          {display ?? value}
        </span>
        <Copy className="h-4 w-4 shrink-0 text-ui-hint" aria-hidden />
      </button>
    </div>
  );
}
