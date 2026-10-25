import { useEffect, useState, type ReactNode } from "react";

type Own = { asset: string } | { lucide: string };

/** The setting's icon for this drive (by id, else name), read here and not through effects/icon.ts: that module is in the kiosk entry, and sharing it would make it a chunk of its own. */
function ownIcon(json: string, id: string, name: string): Own | null {
  let all: unknown;
  try {
    all = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof all !== "object" || all === null) return null;
  const at = (key: string) => (Object.hasOwn(all as object, key) ? (all as Record<string, unknown>)[key] : undefined);
  const v = at(id) ?? at(name);
  if (typeof v !== "object" || v === null) return null;
  const { lucide, asset } = v as { lucide?: unknown; asset?: unknown };
  if (typeof lucide === "string") return { lucide };
  return typeof asset === "string" && /^[0-9a-f]{64}\.[a-z0-9]{1,5}$/.test(asset) ? { asset } : null;
}

/**
 * A drive's own icon: the user's file from the asset store, or a lucide icon (its set is its own
 * chunk, fetched only when a drive uses one). `px` is the square it fits. Loaded on demand (DriveSpaceViews):
 * the kiosk entry carries none of this until a drive has an icon. It imports the generated set itself, not
 * `icons.ts`: that one is shared with the canvas zone, and sharing it would make it a chunk of its own, one
 * more request when the kiosk loads.
 */
export default function DriveIcon({ icons, id, name, px, fallback }: { icons: string; id: string; name: string; px: number; fallback: ReactNode }) {
  const source = ownIcon(icons, id, name);
  const lucide = source && "lucide" in source ? source.lucide : null;
  const [markup, setMarkup] = useState<Readonly<Record<string, string>> | null>(null);
  useEffect(() => {
    if (!lucide) return;
    let live = true;
    void import("@/lib/infopanel/elements/icons.generated").then((m) => live && setMarkup(m.ELEMENT_ICON_MARKUP));
    return () => {
      live = false;
    };
  }, [lucide]);
  if (!source) return <>{fallback}</>;
  if ("asset" in source) return <img src={`/api/assets/${source.asset}`} alt="" width={px} height={px} className="shrink-0 object-contain" style={{ width: px, height: px }} />;
  return (
    <svg
      viewBox="0 0 24 24"
      width={px}
      height={px}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the icon set's own generated markup, never user text.
      dangerouslySetInnerHTML={{ __html: markup && Object.hasOwn(markup, source.lucide) ? markup[source.lucide] : "" }}
    />
  );
}
