// Skin · nixie — Nixie tube: smoked glass, glowing orange Nixie One numerals.
// Fonts to load: Nixie One, Geist. Docs: docs/redesign/widgets/docs/skins/nixie.md
import type { SkinPack } from "../types";

export const nixieSkin: SkinPack = {
  name: "nixie",
  description: "Nixie tube: smoked glass, glowing orange Nixie One numerals.",
  fonts: ["nixie-one", "geist"],
  // tokens read by <Widget>, primitives and views via useSkin()
  skin: { surface: "nixie", radius: 12, accent: "#ff8a3d", font: "'Geist',system-ui,sans-serif", num: "'Nixie One',system-ui,sans-serif", numWeight: 400, numGlow: true, numStroke: "0.04em", glow: true, graph: "line", meter: "segments", header: "nixie", ring: 0.5 },
  // skin-native surfaces (registered into SURFACES)
  surfaces: {
    nixie: { c: "border border-black", s: { background: "radial-gradient(120% 90% at 50% 0%, rgba(255,138,61,.10), transparent 60%), linear-gradient(180deg, #1a1210, #0c0907)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.06), inset 0 -20px 40px -20px rgba(0,0,0,.9)" } },
  },
};
