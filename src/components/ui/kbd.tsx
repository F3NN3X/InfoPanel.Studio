import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A keyboard shortcut hint (mono, bordered). */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-5 border border-ui-strong",
        "bg-ui-raised px-1 font-ui-mono text-micro text-ui-3",
        className
      )}
    >
      {children}
    </kbd>
  );
}
