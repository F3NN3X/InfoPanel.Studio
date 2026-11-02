import { cn } from "@/lib/utils";

export interface LinkRowProps {
  /** Without a label and value the row is just its note and link ("Rename sensors … in Data ↗"). */
  label?: string;
  /** The current value, read-only ("60 fps", "Geist"). */
  value?: string;
  /** Where the value comes from ("Dashboard", "Theme"): shown as "· from X". */
  from?: string;
  /** Numeric values read in mono. */
  mono?: boolean;
  /** A lead-in before the link ("Page order and rotation live in"). */
  note?: string;
  /** The link text without the arrow ("Edit in Theme", "Settings"). */
  link: string;
  onNavigate: () => void;
  className?: string;
}

/**
 * A setting's secondary appearance (SPEC §4.1): its label, its value as
 * read-only text with where it comes from, and a `↗` link to its one home.
 * Never a second editor.
 */
export function LinkRow({ label, value, from, mono, note, link, onNavigate, className }: LinkRowProps) {
  return (
    <div className={cn("flex flex-col gap-[3px] font-ui", className)}>
      {label !== undefined && (
        <div className="flex min-h-7 items-center gap-2.5">
          <span className="min-w-0 flex-1 truncate text-caption text-ui-3">{label}</span>
          <span className="min-w-0 truncate whitespace-nowrap text-caption text-ui-1">
            <span className={cn(mono && "font-ui-mono text-micro tabular-nums")}>{value}</span>
            {from && <span className="text-ui-4"> · from {from}</span>}
          </span>
        </div>
      )}
      <span className="text-micro leading-[1.45] text-ui-hint">
        {note && <>{note} </>}
        <button
          type="button"
          onClick={onNavigate}
          className="rounded-sm text-ui-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
        >
          {link} ↗
        </button>
      </span>
    </div>
  );
}
