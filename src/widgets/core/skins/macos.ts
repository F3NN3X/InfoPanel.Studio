// Skin · macos — macOS Sonoma widget: vibrancy, 22px radius, accent title, rounded numerals, thick rings.
// Fonts to load: system fonts only. Docs: docs/redesign/widgets/docs/skins/macos.md
import type { SkinPack } from "../types";

export const macosSkin: SkinPack = {
  name: "macos",
  description: "macOS Sonoma widget: vibrancy, 22px radius, accent title, rounded numerals, thick rings.",
  fonts: [],
  // tokens read by <Widget>, primitives and views via useSkin()
  skin: { surface: "vibrancy", radius: 22, font: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',system-ui,sans-serif", num: "ui-rounded,'SF Pro Rounded',-apple-system,system-ui,sans-serif", graph: "area", meter: "pill", header: "macos", ring: 1.45 },
  // skin-native surfaces (registered into SURFACES)
  surfaces: {
    vibrancy: { c: "backdrop-blur-[min(40px,var(--wp-blur-cap,40px))] border border-white/[0.08]", s: { background: "linear-gradient(180deg, rgba(62,62,68,.66), rgba(38,38,42,.66))", boxShadow: "0 12px 30px -12px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.1)" } },
  },
};
