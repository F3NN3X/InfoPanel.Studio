// The pack-script overlay's mount in the kiosk and the studio: nothing for a pack without a script, and for one with a script a
// lazy chunk (overlay.tsx), so the entries carry only this. The worker and the QuickJS runtime load from that chunk, on that page only.
import { lazy, Suspense } from "react";
import type { Pack } from "../pack";

const Overlay = lazy(() => import("./overlay"));

export interface PackScriptProps {
  pack: Pack | undefined;
  /** The studio's canvas: asks about an unverified pack's script; the kiosk never asks. */
  studio?: boolean;
  className?: string;
  /** The screen's accent (a variant's, the user's), which the script's palette takes. */
  accent?: string;
}

export function PackScript({ pack, studio, className, accent }: PackScriptProps) {
  if (!pack?.script) return null;
  return (
    <Suspense fallback={null}>
      <Overlay pack={pack} studio={studio} className={className} accent={accent} />
    </Suspense>
  );
}
