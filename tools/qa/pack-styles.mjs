// The widget-style values a built-in pack's Look sets (its sample theme's `sampleStyle`, src/looks/sample-themes.ts) plus its
// `lookId`: what a config that picked the Look hands each widget. The Widget QA page has no config to read them from, so the
// overflow runner and the pack visibility spec pass them as `settings`. tests/tools/qa/pack-styles.test.ts keeps them equal to the source.
export const PACK_STYLES = {
  "field-kit": { lookId: "field-kit", surface: "look-field-kit", accent: "#8A5C00", textColor: "#1A1C21", mutedColor: "#5E5A52", ok: "#146C34", warn: "#8A5A00", crit: "#A8340F", font: "sans" },
  "tape-86": { lookId: "tape-86", surface: "look-tape-86", accent: "#B83A08", textColor: "#2A2523", mutedColor: "#5C5248", ok: "#146C34", warn: "#8A5A00", font: "sans" },
  term: { lookId: "term", surface: "look-term", accent: "#8BE37A", textColor: "#8BE37A", mutedColor: "#6FA463", font: "mono", numGlow: "soft" },
  "neon-stripe": { lookId: "neon-stripe", surface: "look-neon-stripe", accent: "#2BD46F", textColor: "#F7C51E", mutedColor: "#7FD9D4", font: "auto" },
  overdrive: { lookId: "overdrive", surface: "look-overdrive", accent: "#F3E600", textColor: "#2DE2E6", mutedColor: "#C9C27A", font: "auto" },
  "swiss-mono": { lookId: "swiss-mono", surface: "look-swiss-mono", accent: "#FF4D2E", textColor: "#F2F0EB", mutedColor: "#9A968D", font: "auto" },
  holo: { lookId: "holo", surface: "look-holo", accent: "#4FD8FF", textColor: "#EAF9FF", mutedColor: "#7FA6B8", font: "auto" },
  "night-glow": { lookId: "night-glow", surface: "look-night-glow", accent: "#3EE6FF", textColor: "#F2F4FF", mutedColor: "#9AA3D6", font: "auto" },
  paper: { lookId: "paper", surface: "look-paper", accent: "#5B3FD4", textColor: "#1F1B2E", mutedColor: "#6B6578", warn: "#A14A00", font: "auto" },
  "classy-black": { lookId: "classy-black", surface: "look-classy-black", accent: "#D4D4D8", textColor: "#F5F5F4", mutedColor: "#A3A3A3", font: "auto" },
  "liquid-glass": { lookId: "liquid-glass", surface: "look-liquid-glass", accent: "#F5A3C7", textColor: "#F8F4FF", mutedColor: "#BDB4D4", font: "auto" },
  "black-and-gold": { lookId: "black-and-gold", surface: "look-black-and-gold", accent: "#D4AF37", textColor: "#F4EBD0", mutedColor: "#B7A97C", font: "auto" },
  cyberspec: { lookId: "cyberspec", surface: "look-cyberspec", accent: "#FF3B45", textColor: "#5EF6FF", mutedColor: "#FF5B5B", ok: "#2BF59A", warn: "#FFD23F", crit: "#FF3B45", font: "auto" },
};
