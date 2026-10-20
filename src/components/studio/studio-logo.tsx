/** The studio mark: an accent tile holding a small dashboard grid (one wide widget over two). */
export function StudioLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 26" className={className} aria-hidden>
      <rect width="26" height="26" rx="7" fill="var(--ui-accent, oklch(0.72 0.15 255))" />
      <rect x="6" y="6" width="14" height="6" rx="1.5" fill="#fff" />
      <rect x="6" y="14" width="6" height="6" rx="1.5" fill="#fff" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" fill="#fff" fillOpacity=".55" />
    </svg>
  );
}
