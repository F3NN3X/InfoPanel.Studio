/**
 * An image the canvas can't load (its file is missing from the asset table or the store): diagonal
 * stripes in neutral greys with a broken-image icon centred (lucide's ImageOff paths, inline since this
 * draws inside the profile's own SVG-free DOM).
 */
export function MissingImage({ width: w, height: h, id }: { width: number; height: number; id: string }) {
  const icon = Math.max(8, Math.min(Math.min(w, h) * 0.35, 48));
  const pattern = `${id}-missing`;
  return (
    <svg data-missing-image width={w} height={h} style={{ display: "block" }}>
      <defs>
        <pattern id={pattern} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={8} height={8} fill="#2b2b30" />
          <rect width={4} height={8} fill="#38383f" />
        </pattern>
      </defs>
      <rect width={w} height={h} fill={`url(#${pattern})`} />
      <rect x={0.5} y={0.5} width={Math.max(0, w - 1)} height={Math.max(0, h - 1)} fill="none" stroke="#6b6b75" shapeRendering="crispEdges" />
      <g
        transform={`translate(${w / 2 - icon / 2} ${h / 2 - icon / 2}) scale(${icon / 24})`}
        fill="none"
        stroke="#a0a0aa"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1={2} x2={22} y1={2} y2={22} />
        <path d="M10.41 10.41a2 2 0 1 1-2.83-2.83" />
        <line x1={13.5} x2={6} y1={13.5} y2={21} />
        <line x1={18} x2={21} y1={12} y2={15} />
        <path d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59" />
        <path d="M21 15V5a2 2 0 0 0-2-2H9" />
      </g>
    </svg>
  );
}
