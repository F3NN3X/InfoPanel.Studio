/** The checker behind an Auto swatch (no color is set). */
const CHECKER = "repeating-conic-gradient(#3a3a42 0% 25%, #24242a 0% 50%) 50% / 8px 8px";

/**
 * The color control (README §4.6): a bordered pill with "Auto" or the hex in
 * mono and a 20 px swatch that opens the native picker. "" is Auto; the
 * source dot resets it, or `onReset` where a row has no dot.
 */
export function ColorPill({
  value,
  onChange,
  label,
  onReset,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name. */
  label: string;
  /** A reset beside the pill, for rows without a source dot. */
  onReset?: () => void;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {value && onReset && (
        <button
          type="button"
          aria-label={`Reset ${label} to Auto`}
          onClick={onReset}
          className="text-micro text-ui-4 hover:text-ui-1"
        >
          Auto
        </button>
      )}
      <label className="flex h-7 cursor-pointer items-center gap-2 rounded-md border border-ui-strong bg-ui-hover pl-[9px] pr-1">
        <span className="font-ui-mono text-micro text-ui-2">{value ? value.toUpperCase() : "Auto"}</span>
        <span
          className="relative h-5 w-5 shrink-0 overflow-hidden rounded-[4px] border border-ui-strong"
          style={value ? { backgroundColor: value } : { background: CHECKER }}
        >
          <input
            type="color"
            aria-label={label}
            value={value || "#000000"}
            onChange={(e) => onChange(e.currentTarget.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </span>
      </label>
    </span>
  );
}
