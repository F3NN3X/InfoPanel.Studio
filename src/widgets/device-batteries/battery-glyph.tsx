// The battery glyph the pills, the single view and the rail's one-device item draw: an outlined shell, a terminal tip and
// a fill in the charge's colour. After BatteryDock's `paint_battery_meter_themed` (MIT, https://github.com/jorjanion/BatteryDock,
// src/ui/icons.rs), drawn at 23 x 10.5 for a 16 px icon and scaled with `size`.
const W = 23;
const H = 10.5;
/** The shell's outer width: the tip takes the rest. */
const SHELL = W - 2.5;
/** The fill's room: the shell inside a 1.5 inset. */
const ROOM = SHELL - 3;

export function BatteryGlyph({ percent, colour, size = 16, className = "" }: { percent?: number; colour: string; size?: number; className?: string }) {
  const k = size / 16;
  const fill = percent === undefined ? 0 : (ROOM * Math.min(100, Math.max(0, percent))) / 100;
  return (
    <svg data-part="battery-glyph" aria-hidden viewBox={`0 0 ${W} ${H}`} width={W * k} height={H * k} className={`inline-block shrink-0 text-[color:var(--w-muted)] ${className}`}>
      <rect x={0.5} y={0.5} width={SHELL - 1} height={H - 1} rx={2.5} fill="none" stroke="currentColor" strokeWidth={1} />
      <rect x={SHELL + 0.5} y={(H - 5) / 2} width={1.5} height={5} rx={0.8} fill="currentColor" />
      {fill * k > 0.5 && <rect data-part="charge-bar" x={1.5} y={1.5} width={fill} height={H - 3} rx={1.5} style={{ fill: colour }} />}
    </svg>
  );
}
