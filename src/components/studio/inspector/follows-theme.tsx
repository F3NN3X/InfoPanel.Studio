/** A section that follows the theme with Advanced off: one line and the way to take it over. */
export function FollowsTheme({ onCustomise }: { onCustomise: () => void }) {
  return (
    <p className="flex items-center gap-2 py-1.5 pl-4 pr-2.5 text-[12px] text-ui-3">
      <span className="flex-1">Follows theme</span>
      <button type="button" onClick={onCustomise} className="font-medium text-[oklch(0.80_0.12_255)] hover:underline">
        Change here
      </button>
    </p>
  );
}
