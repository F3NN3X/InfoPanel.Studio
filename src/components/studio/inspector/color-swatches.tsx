import { Pipette } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The colour swatches every colour field offers (inspector rows, the quick
 * bar's popover): Auto (""), the six accent hues of the studio palette
 * (oklch(0.72 0.15 H) for H = 255, 295, 190, 150, 75, 15, stored as hex so
 * every consumer and the native picker read them), White, then the custom
 * picker.
 */
export const SWATCHES: readonly { value: string; name: string }[] = [
  { value: "", name: "Auto" },
  { value: "#5fa7ff", name: "Blue" },
  { value: "#ac8ff8", name: "Violet" },
  { value: "#00c1b9", name: "Teal" },
  { value: "#53be70", name: "Green" },
  { value: "#da950b", name: "Amber" },
  { value: "#f37986", name: "Rose" },
  { value: "#ededf0", name: "White" },
];

/** The split swatch of Auto (no colour set). */
const AUTO_BG = "linear-gradient(135deg, #3a3a42 0 50%, var(--ui-accent) 50% 100%)";
/** The ring around the selected swatch. */
const SELECTED_RING = "shadow-[0_0_0_2px_var(--ui-bg-panel),0_0_0_4px_#ededf0]";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** What a colour is called: "Auto", a swatch's name, or its hex. */
export function colorName(value: string): string {
  return SWATCHES.find((s) => same(s.value, value))?.name ?? value.toUpperCase();
}

/** A swatch circle's background. */
export const swatchBackground = (value: string) => (value ? value : AUTO_BG);

/** The inline colour button: the colour's name and an 18 px swatch. */
export function ColorButton({
  value,
  name,
  open,
  label,
  onClick,
}: {
  value: string;
  /** Shown instead of the colour's name (a palette role: "Series 1"). */
  name?: string;
  open: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${label}: ${name ?? colorName(value)}`}
      onClick={onClick}
      className={cn(
        "flex h-7 shrink-0 items-center gap-[7px] rounded-md border bg-ui-hover pl-[9px] pr-1 text-[11.5px] text-ui-2",
        open ? "border-ui-accent" : "border-ui-strong hover:border-ui-menu"
      )}
    >
      <span className={cn(!name && !SWATCHES.some((s) => same(s.value, value)) && "font-ui-mono text-[11px]")}>{name ?? colorName(value)}</span>
      <span className="h-[18px] w-[18px] rounded-full" style={{ background: swatchBackground(value) }} />
    </button>
  );
}

/** The swatch row (22 px circles) with the custom picker last. */
export function ColorSwatches({
  value,
  label,
  onChange,
  className,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const custom = !SWATCHES.some((s) => same(s.value, value));
  return (
    <div
      role="group"
      aria-label={`${label} swatches`}
      className={cn("flex flex-wrap items-center gap-[9px] rounded-lg border border-ui-default bg-ui-app px-2.5 py-[9px]", className)}
    >
      {SWATCHES.map((s) => (
        <button
          key={s.name}
          type="button"
          title={s.name}
          aria-label={s.name}
          aria-pressed={same(s.value, value)}
          onClick={() => onChange(s.value)}
          className={cn("h-[22px] w-[22px] rounded-full", same(s.value, value) && SELECTED_RING)}
          style={{ background: swatchBackground(s.value) }}
        />
      ))}
      <label
        title="Custom colour"
        className={cn(
          "relative flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-full border border-ui-strong text-ui-3 hover:text-ui-1",
          custom && SELECTED_RING
        )}
        style={custom ? { background: value } : undefined}
      >
        {!custom && <Pipette className="h-3 w-3" />}
        <input
          type="color"
          aria-label={`${label}: custom colour`}
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.currentTarget.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
