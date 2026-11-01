/**
 * Where a scroll profile's screen ends: the page past its design height is
 * dimmed under a dashed line, so the design size reads as the frame while
 * the rows below stay editable (the kiosk scrolls to them). Sits inside the
 * zoomed page, so its strokes and label are divided by `zoom` to stay
 * constant on screen.
 */
export function ScreenFold({ height, zoom }: { height: number; zoom: number }) {
  const px = (n: number) => n / Math.max(zoom, 0.01);
  return (
    <div
      aria-hidden
      data-screen-fold
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[11] bg-black/45"
      style={{ top: height, borderTop: `${px(1.5)}px dashed #8a8a94` }}
    >
      <span
        className="absolute left-0 whitespace-nowrap rounded-b-md bg-s-divider font-ui text-ui-2"
        style={{ top: 0, fontSize: px(11), padding: `${px(2)}px ${px(8)}px`, marginLeft: px(8) }}
      >
        {`Screen ends at ${height} px · the kiosk scrolls`}
      </span>
    </div>
  );
}
