// The alert card's `slab` layout (look.json `layouts.alert`, src/widgets/layouts.ts): the kit's alert. A solid slab in the severity's
// tone down the left with the icon in dark ink over a scan-line texture, the card tinted with the tone and edged in it with the
// bottom-right corner cut, the title in upper-case tracked type and a `// NOTICE` mark beside it. The tones are the worn pack's
// info, warn and crit (`PackChrome.tones`), checked to 4.5:1 there; the card's size, slot, live region and tap stay the standard's.
import type { CSSProperties } from "react";
import { Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ActiveAlert, Severity } from "@/lib/alerts";
import { alertTitle } from "@/lib/island/from-alerts";
import type { SlabTone } from "@/looks/chrome";
import { ownSlabVars } from "@/looks/treatments";
import { cn } from "@/lib/utils";
import { ageLabel, cardClasses } from "./alert-model";

const ICONS: Record<Severity, LucideIcon> = { info: Info, warning: TriangleAlert, critical: OctagonAlert };

/** The word the card prints beside its title. */
export const SEVERITY_MARK: Readonly<Record<Severity, string>> = { info: "Notice", warning: "Caution", critical: "Critical" };

/** The cut corner, in the card's own em so it grows with the alert's size. */
const CUT = "0.7em";

export interface SlabAlertCardProps {
  alert: ActiveAlert;
  now: number;
  tone: SlabTone;
  /** The standard card's entrance or exit class (none under reduced motion). */
  motion?: string;
  fraction: number | null;
  reduced: boolean;
  onAck: (id: string) => void;
}

export function SlabAlertCard({ alert, now, tone, motion, fraction, reduced, onAck }: SlabAlertCardProps) {
  const Icon = ICONS[alert.severity];
  const overlay = alert.display.style === "overlay";
  return (
    <div
      data-alert-id={alert.id}
      data-part="alert"
      data-layout="slab"
      data-severity={alert.severity}
      onClick={() => onAck(alert.id)}
      className={cn("pointer-events-auto relative flex cursor-pointer select-none items-stretch overflow-hidden !rounded-none !p-0 shadow-xl", cardClasses(alert), motion)}
      style={{ background: tone.fill, boxShadow: `inset 0 0 0 1px ${tone.tone}, 0 8px 30px -8px ${tone.tone}`, clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${CUT}), calc(100% - ${CUT}) 100%, 0 100%)` } as CSSProperties}
    >
      <div aria-hidden data-wp-slab="accent" className={cn("flex shrink-0 items-center justify-center", overlay ? "w-[3.2em]" : "w-[2.6em]")} style={ownSlabVars(tone.tone) as CSSProperties}>
        <Icon className={cn(overlay ? "h-10 w-10" : "h-[1.3em] w-[1.3em]")} />
      </div>
      <div role={alert.severity === "info" ? "status" : "alert"} className={cn("min-w-0 flex-1", overlay ? "p-6" : "px-[1em] py-[0.75em]")}>
        <div className="flex items-baseline justify-between gap-3">
          <div className="line-clamp-2 break-words font-semibold uppercase tracking-[0.08em]" style={{ color: tone.title }}>{alertTitle(alert)}</div>
          <div aria-hidden className="shrink-0 text-[0.75em] font-semibold uppercase tracking-[0.1em]" style={{ color: tone.title }}>
            {`// ${SEVERITY_MARK[alert.severity]}`}
          </div>
        </div>
        {alert.text && <div className="mt-0.5 whitespace-pre-line text-[0.9em] text-muted-foreground">{alert.text}</div>}
        <div aria-hidden className="mt-1 text-[0.75em] uppercase tracking-[0.08em] text-muted-foreground">{ageLabel(alert, now)}</div>
      </div>
      <button type="button" aria-label={`Dismiss ${alertTitle(alert)}`} className="alert-dismiss kiosk-focus sr-only">
        Dismiss
      </button>
      {fraction !== null && (
        <div
          className="absolute bottom-0 left-0 right-[0.7em] h-1 origin-left"
          style={{ background: tone.tone, transform: `scaleX(${fraction})`, transition: reduced ? undefined : "transform 1s linear" }}
        />
      )}
    </div>
  );
}
