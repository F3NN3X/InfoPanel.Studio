import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A keyboard shortcut hint (mono, bordered). */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-ui-strong",
        "bg-ui-raised px-1 font-ui-mono text-micro text-ui-3",
        className
      )}
    >
      {children}
    </kbd>
  );
}
