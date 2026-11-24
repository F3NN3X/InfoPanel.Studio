import type { Look } from "@/looks/look";
import type { BurnIn, Pack } from "@/looks/pack";
import { LAYOUTS, layoutKindName, offers, STANDARD_LAYOUT } from "@/widgets/layouts";

/**
 * What a theme brings, as words: Theme's "In this theme" rows and the Browse detail pane's "What it brings". Read from the
 * loaded pack and its Look, so a pack shows what it really draws; a plain theme has none of the pack parts. Pure.
 */

export interface PartText {
  id: "scenery" | "effects" | "details" | "icons" | "layouts" | "font";
  label: string;
  /** One line under the label. */
  hint: string;
  /** The short form (Browse's right-aligned value). */
  value: string;
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const sentence = (items: readonly string[]): string => {
  const text = items.join(", ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const andList = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** The pack's font families by their source name, once each ("Barlow Condensed"); the Look's body font when the pack names none. */
export function fontName(pack: Pack | undefined, look: Look | undefined): string {
  const sources = [...new Set((pack?.fonts ?? []).flatMap((f) => (f.source ? [f.source] : [])))];
  return sources.length > 0 ? sources.join(", ") : (look?.fonts.body ?? "System");
}

/** The pack's licences, once each ("OFL-1.1"). */
const licences = (pack: Pack | undefined): string => [...new Set((pack?.fonts ?? []).flatMap((f) => (f.licence ? [f.licence] : [])))].join(", ");

/** The parts a pack carries beyond values; a theme that is not a pack (or has not loaded) has none of the first four. */
export function packParts(pack: Pack | undefined, look: Look | undefined): PartText[] {
  const parts: PartText[] = [];
  const layers = pack?.stage?.layers.length ?? 0;
  if (pack && (layers > 0 || pack.stage?.overlay)) {
    const n = layers + (pack.stage?.overlay ? 1 : 0);
    parts.push({ id: "scenery", label: "Scenery", hint: "Art behind the widgets", value: plural(n, "layer") });
  }
  const effects = [...new Set((pack?.stage?.effects ?? []).map((e) => e.kind))];
  if (effects.length > 0) {
    const heavy = (pack?.stage?.effects ?? []).some((e) => e.cost === "filter" || e.cost === "mask" || e.cost === "animated");
    parts.push({ id: "effects", label: "Effects", hint: `Drawn by the app · ${heavy ? "uses the GPU" : "light on the GPU"}`, value: sentence(effects) });
  }
  const details = [pack?.slots?.ornament ? "corner marks" : "", pack?.slots?.tabBand ? "header bands" : ""].filter(Boolean);
  if (details.length > 0) parts.push({ id: "details", label: "Card details", hint: "Marks and bands on the cards", value: sentence(details) });
  const icons = Object.keys(pack?.slots?.icons ?? {}).length;
  if (icons > 0) parts.push({ id: "icons", label: "Icons", hint: "Replace the default icons", value: `Own set of ${icons}` });
  const layouts = layoutNames(pack);
  if (layouts.length > 0) parts.push({ id: "layouts", label: "Widget layouts", hint: "Widgets laid out the theme's way · Layout on a widget overrides it", value: layouts.join(", ") });
  const name = fontName(pack, look);
  parts.push({ id: "font", label: "Font", hint: pack?.fonts?.length ? `${name}, bundled with the theme` : name, value: licences(pack) });
  return parts;
}

/** The layouts a pack's Look names, as "Calendar: Month navigator" (a standard or unknown one is left out, as the zones leave it). */
export function layoutNames(pack: Pack | undefined): string[] {
  return Object.entries(pack?.look.layouts ?? {}).flatMap(([kind, id]) =>
    id !== STANDARD_LAYOUT && offers(kind, id) ? [`${layoutKindName(kind)}: ${LAYOUTS[kind].find((l) => l.id === id)?.name}`] : [],
  );
}

/** "Dark, light": the modes a Look supports. */
export const modesText = (look: Look | undefined): string => (look ? sentence(look.modes.supported) : "");

const BURN_IN: Readonly<Record<BurnIn, string>> = { "static-safe": "Safe when static", "needs-shift": "Needs pixel shift", "needs-dim": "Needs idle dim" };

/** The pack's burn-in need. */
export const burnInOf = (pack: Pack | undefined): string => BURN_IN[pack?.burnIn ?? "static-safe"];

/** The screen's two protections, as the Burn-in care row's hint ("Pixel shift on · idle dim 15 min"). */
export function protectionText(general: { pixelShift: boolean; idleDim: number }): string {
  return `Pixel shift ${general.pixelShift ? "on" : "off"} · idle dim ${general.idleDim > 0 ? `${general.idleDim} min` : "off"}`;
}

/** Whether the screen's protection answers what the pack needs (the Burn-in care row warns when it does not). */
export function protectionMissing(pack: Pack | undefined, general: { pixelShift: boolean; idleDim: number }): boolean {
  if (pack?.burnIn === "needs-shift") return !general.pixelShift;
  if (pack?.burnIn === "needs-dim") return !(general.idleDim > 0);
  return false;
}

/** The Browse detail's "What it brings" rows: the pack parts, the modes and the burn-in need. */
export function bringsRows(pack: Pack | undefined, look: Look | undefined): { label: string; value: string }[] {
  const rows = packParts(pack, look).map((p) => ({ label: p.label, value: p.id === "font" ? [fontName(pack, look), p.value].filter(Boolean).join(" · ") : p.value }));
  if (look) rows.push({ label: "Modes", value: modesText(look) });
  if (pack) rows.push({ label: "Burn-in", value: burnInOf(pack) });
  return rows;
}

const KIND: Readonly<Record<"pack" | "plain" | "saved" | "yours", string>> = { pack: "Theme pack", plain: "Theme", saved: "Saved theme", yours: "Your pack" };

/** The detail's kind line: "Theme pack · dark and light". */
export const kindText = (kind: keyof typeof KIND, look: Look | undefined): string => `${KIND[kind]}${look ? ` · ${andList(look.modes.supported)}` : ""}`;
