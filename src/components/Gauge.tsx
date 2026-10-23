import { cn } from "@/lib/utils";

interface GaugeProps {
  label: string;
  value?: string | number;
  unit?: string;
  /** 0–100, drives the ring. */
  percent?: number;
  size?: number;
  /** Font size (px) of the number inside the ring. */
  fontSize?: number;
  className?: string;
}

/**
 * Circular progress ring. The ring stroke uses `currentColor`, so wrapping
 * it (or the frame) in a themed/accented scope recolors it automatically.
 */
export function Gauge({
  label,
  value,
  unit,
  percent,
  size = 72,
  fontSize,
  className,
}: GaugeProps) {
  const p = Math.max(0, Math.min(100, percent ?? 0));
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div
      data-gauge
      className={cn("flex flex-col items-center gap-1.5", className)}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={4}
            className="stroke-muted/50"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - p / 100)}
            className="stroke-accent text-accent transition-[stroke-dashoffset] duration-300"
            data-wp-ring=""
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="font-semibold tabular-nums text-foreground"
            style={fontSize ? { fontSize } : { fontSize: "0.875rem" }}
          >
            {value !== undefined ? value : "—"}
            {unit && value !== undefined && (
              <span className="ml-0.5 text-[10px] text-muted-foreground">
                {unit}
              </span>
            )}
          </div>
        </div>
      </div>
      {label ? (
        <div className="text-xs text-muted-foreground">{label}</div>
      ) : null}
    </div>
  );
}
