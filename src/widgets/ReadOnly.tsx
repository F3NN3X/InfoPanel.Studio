import type { ReactNode } from "react";
import { READ_ONLY_HINT } from "@/lib/write-refusal";

/** A control widget's body, dimmed and out of reach (with a tooltip) once the server has refused its writes. */
export function ReadOnly({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return children;
  return (
    <div className="h-full opacity-60" title={READ_ONLY_HINT}>
      <div className="pointer-events-none h-full">{children}</div>
    </div>
  );
}
