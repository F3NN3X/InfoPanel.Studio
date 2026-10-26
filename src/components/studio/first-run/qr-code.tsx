/** A QR code for an address (lean-qr), drawn as one SVG path in black on the white card behind it. */
import { useMemo } from "react";
import { generate } from "lean-qr";

export function QrCode({ text, size }: { text: string; size: number }) {
  const { path, count } = useMemo(() => {
    const code = generate(text);
    let d = "";
    for (let y = 0; y < code.size; y++) for (let x = 0; x < code.size; x++) if (code.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
    return { path: d, count: code.size };
  }, [text]);
  return (
    <svg role="img" aria-label={`QR code for ${text}`} width={size} height={size} viewBox={`0 0 ${count} ${count}`} shapeRendering="crispEdges" className="block">
      <path d={path} fill="#000" />
    </svg>
  );
}
