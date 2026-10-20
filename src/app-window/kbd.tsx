import type { ReactNode } from "react";

/** A small mono key hint: `Ctrl K`. */
export function Kbd({ children }: { children: ReactNode }) {
  return <span className="shrink-0 whitespace-nowrap rounded border border-s-input-line px-1.5 py-px font-mono text-[11px] text-[#9696a0]">{children}</span>;
}
