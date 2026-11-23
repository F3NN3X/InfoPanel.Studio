import { gridCell } from "@/components/alerts/alert-model";
import type { AlertPosition, Severity } from "@/lib/alerts";
import type { MonitorProfile } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { SeverityDot } from "./alerts-fields";
import { ScreenThumb } from "./screens/screen-thumb";

const BOX_HEIGHT = 240;

const EDGE: Record<Severity, string> = { info: "border-ui-accent", warning: "border-ui-warn", critical: "border-ui-danger" };

export type Landing = "island" | "toast" | "top toast" | "banner" | "overlay";

interface AlertPreviewProps {
  profile: MonitorProfile;
  landing: Landing;
  name: string;
  text: string;
  severity: Severity;
  position: AlertPosition;
  small: boolean;
}

/** A screen's kept picture with a drawn stand-in for the alert: where it lands and how big, not its pixels. */
export function AlertPreview({ profile, landing, name, text, severity, position, small }: AlertPreviewProps) {
  const ratio = profile.width / profile.height;
  const card = (
    <span className={cn("block max-w-full overflow-hidden rounded-md border-[1.5px] bg-black px-2 py-1 text-nano leading-tight text-white", EDGE[severity], small ? "w-24" : "w-32")}>
      <span className="flex items-center gap-1 truncate">
        <SeverityDot severity={severity} className="h-1 w-1" />
        <span className="truncate font-medium">{name}</span>
      </span>
      {text && <span className="block truncate font-ui-mono opacity-70">{text}</span>}
    </span>
  );
  const cell = gridCell(landing === "top toast" ? "top" : position);
  return (
    <div
      role="img"
      aria-label={`${name} on ${profile.name}`}
      className="relative mx-auto overflow-hidden rounded-10 border border-ui-default bg-ui-chrome"
      style={{ aspectRatio: ratio, width: `min(100%, ${BOX_HEIGHT * ratio}px)` }}
    >
      <ScreenThumb profile={profile} />
      {landing === "island" && (
        <span className={cn("absolute left-1/2 top-1.5 flex max-w-[60%] -translate-x-1/2 items-center gap-1.5 truncate rounded-full border-[1.5px] bg-black px-3 py-1 text-nano text-white", EDGE[severity])}>
          <SeverityDot severity={severity} className="h-1 w-1" />
          <span className="truncate font-medium">{name}</span>
          {text && <span className="truncate font-ui-mono opacity-70">{text}</span>}
        </span>
      )}
      {landing === "banner" && (
        <span className={cn("absolute inset-x-0 flex items-center gap-2 border-y bg-black px-3 py-1 text-nano text-white", EDGE[severity], position.startsWith("bottom") ? "bottom-0" : "top-0")}>
          <SeverityDot severity={severity} className="h-1 w-1" />
          <span className="truncate font-medium">{name}</span>
          {text && <span className="truncate font-ui-mono opacity-70">{text}</span>}
        </span>
      )}
      {landing === "overlay" && <span className="absolute inset-0 grid place-items-center bg-black/40">{card}</span>}
      {(landing === "toast" || landing === "top toast") && (
        <span className="absolute inset-1 grid grid-cols-3 grid-rows-3">
          <span
            className={cn("col-span-1 flex", cell.row === 2 && "items-center", cell.row === 3 && "items-end", cell.col === 2 && "justify-center", cell.col === 3 && "justify-end")}
            style={{ gridColumn: cell.col, gridRow: cell.row }}
          >
            {card}
          </span>
        </span>
      )}
    </div>
  );
}
