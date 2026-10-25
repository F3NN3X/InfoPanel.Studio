/**
 * Your own icons, one definition for both editors: a lucide icon name, or a file from the Library
 * (an SVG or a PNG), picked per Icon element and per drive. We ship no emblems of our own. Native
 * widgets show the file by its asset id ("<sha256>.<ext>"); InfoPanel items read it as a native Image
 * of the canvas's file (`file`, its name there; a source with none is not for a canvas). A file is
 * drawn as it is, never tinted. Pure.
 */

/** `width` and `height` are the file's own pixel size, when known: the icon is then drawn aspect-fit, not stretched. */
export type IconSource = { lucide: string } | { asset: string; file?: string; width?: number; height?: number };

const HASH = /^[0-9a-f]{64}(\.[a-z0-9]{1,5})?$/;
const LUCIDE = /^[a-z0-9-]{1,48}$/;

/** At most this many drives keep an icon. */
export const MAX_DRIVE_ICONS = 64;

export function normalizeIconSource(v: unknown): IconSource | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.lucide === "string") return LUCIDE.test(o.lucide) ? { lucide: o.lucide } : null;
  if (typeof o.asset !== "string" || !HASH.test(o.asset)) return null;
  const size = [o.width, o.height].every((n) => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 16384) ? { width: o.width as number, height: o.height as number } : {};
  if (o.file === undefined) return { asset: o.asset, ...size };
  const file = typeof o.file === "string" ? o.file.trim() : "";
  return file && file.length <= 200 && !file.includes("/") && !file.includes("\\") ? { asset: o.asset, file, ...size } : null;
}

/** Per-drive icons keyed by drive id (or name); undefined when none are valid, so the field stays sparse. */
export function normalizeDriveIcons(v: unknown): Record<string, IconSource> | undefined {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return undefined;
  const entries = Object.entries(v)
    .slice(0, MAX_DRIVE_ICONS)
    .flatMap(([key, value]) => {
      const source = normalizeIconSource(value);
      return source && key.length > 0 && key.length <= 200 ? [[key, source] as const] : [];
    });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/** The canvas file name of a user's file source; null for a lucide one (or none). */
export const iconFileOf = (source: IconSource | null | undefined): string | null => (source && "asset" in source ? source.file || null : null);

/** The per-drive icons a native widget's setting holds (a JSON object string; "" or anything unreadable is none). */
export function driveIconsOfSetting(v: unknown): Record<string, IconSource> | undefined {
  if (typeof v !== "string" || v === "") return undefined;
  try {
    return normalizeDriveIcons(JSON.parse(v));
  } catch {
    return undefined;
  }
}

/** A drive's icon: by its id, else by its name (HWiNFO ids can change between boots, its names do not). */
export const driveIconOf = (icons: Readonly<Record<string, IconSource>> | undefined, id: string | undefined, name: string): IconSource | null => {
  const own = (key: string | undefined) => (key !== undefined && icons && Object.hasOwn(icons, key) ? icons[key] : undefined);
  return own(id) ?? own(name) ?? null;
};

/** The lucide icon an Icon element draws: its source's when that is a lucide one, else its own `name`. */
export const lucideNameOf = (spec: { name: string; source?: IconSource }): string => (spec.source && "lucide" in spec.source ? spec.source.lucide : spec.name);

/**
 * Where a `w` x `h` icon draws inside a `box`: aspect-fit (contain) and centred, on whole pixels. A source with no known
 * size, or a lucide one, fills the box. A wide file is as wide as the box and centred vertically; a tall one the reverse.
 */
export function fitIcon(source: IconSource | null | undefined, box: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
  if (!source || !("asset" in source) || !source.width || !source.height) return box;
  const k = Math.min(box.w / source.width, box.h / source.height);
  const w = Math.max(1, Math.round(source.width * k));
  const h = Math.max(1, Math.round(source.height * k));
  return { x: box.x + Math.round((box.w - w) / 2), y: box.y + Math.round((box.h - h) / 2), w, h };
}
