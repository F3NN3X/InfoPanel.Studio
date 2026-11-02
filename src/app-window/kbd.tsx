import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A small mono key hint: `Ctrl K`. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("shrink-0 whitespace-nowrap rounded border border-s-input-line px-1.5 py-px font-mono text-micro text-[#9696a0]", className)}>{children}</span>;
}
