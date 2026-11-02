import { useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Each section's "More" rows (replacing the Advanced switch): open or closed
 * per section per zone type, for the session only. Search and Changed list
 * More rows inline, so they never go through here.
 */
const expanded = new Set<string>();
const listeners = new Set<() => void>();

/** The session key of a section's More rows: the zone type (widget id, "panel", ...) and the section. */
export const moreKey = (scope: string, sectionId: string): string => `${scope}:${sectionId}`;

/** Open or close a section's More rows ("Go to setting" opens them for a More row). */
export function setMoreOpen(key: string, open: boolean) {
  if (open === expanded.has(key)) return;
  if (open) expanded.add(key);
  else expanded.delete(key);
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Whether a section's More rows are open. */
export function useMoreOpen(key: string): boolean {
  const read = () => expanded.has(key);
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * The end of a section with More rows: a "More (n)" link, or while open the
 * rows on a sunk background and a "Less" link that closes them.
 */
export function MoreRows({
  storeKey,
  count,
  children,
  className,
  label,
}: {
  storeKey: string;
  count: number;
  children: ReactNode;
  /** The closed link's text (default "More (n)"). */
  label?: string;
  /** The link's own spacing (a field row's inset by default). */
  className?: string;
}) {
  const open = useMoreOpen(storeKey);
  if (count === 0) return null;
  return (
    <>
      {open && <div className="bg-ui-chrome py-1">{children}</div>}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setMoreOpen(storeKey, !open)}
        className={cn(
          "block py-1.5 pl-4 pr-2.5 text-left text-caption font-medium text-ui-accent-text hover:underline",
          className
        )}
      >
        {open ? "Less" : (label ?? `More (${count})`)}
      </button>
    </>
  );
}
