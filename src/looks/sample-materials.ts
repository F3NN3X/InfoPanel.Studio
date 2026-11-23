// The cards of the sample themes (_docs/look-system/03-theme-packs-spec.md, "Worked examples"): level 1 only, so each is a
// T2 material the registry's kinds already express. Frames, headers, ornaments and page layers are not here (P8 to P11).
// Every edge is an inset shadow and no class adds a border, so a sample card keeps Classic's box (G2).
import { cappedBlur } from "@/components/widget-style";
import { lookLayers, sampleCards } from "./sample-cards";
import { SAMPLE_THEMES, sampleStyle } from "./sample-themes";
import { m, type Material, type MaterialKind, type SurfaceTone } from "./materials";

const ring = (color: string, px = 1) => `inset 0 0 0 ${px}px ${color}`;
const blur = (px: number) => ({ backdropFilter: `blur(${cappedBlur(px)})`, WebkitBackdropFilter: `blur(${cappedBlur(px)})` });
// Holo's corner brackets: eight hairline layers pinned to the corners.
const BRACKETS = ["top left", "top right", "bottom left", "bottom right"].flatMap((at) => [`linear-gradient(#4FD8FF,#4FD8FF) ${at}/16px 1.5px no-repeat`, `linear-gradient(#4FD8FF,#4FD8FF) ${at}/1.5px 16px no-repeat`]).join(",");

// Overdrive's chamfer (P11): two corners cut 12 px (the plan's cap is 20 px, twice the smallest padding) by a clip on the card, and the
// yellow edge drawn along each cut by a diagonal line in a corner box (the inset ring stops at the clip). The cut follows the padding
// (`--wp-pad`, set by a look's Padding such as Compact's 4 px) to at most 1.5 times it, so a header value or a label in a corner is never clipped.
const CUT = "min(12px, calc(var(--wp-pad, 12px) * 1.5))";
const CHAMFER = `polygon(0 0, calc(100% - ${CUT}) 0, 100% ${CUT}, 100% 100%, ${CUT} 100%, 0 calc(100% - ${CUT}))`;
const cutEdge = (at: string, to: string) => `linear-gradient(${to}, transparent calc(50% - 1.2px), rgba(243,230,0,.85) calc(50% - 1.2px) 50%, transparent 50%) ${at}/${CUT} ${CUT} no-repeat`;
const CHAMFER_EDGES = [cutEdge("top right", "to top right"), cutEdge("bottom left", "to bottom left")].join(",");

const sample = (id: string, kind: MaterialKind, tone: SurfaceTone, exp: string, s: Material["s"]): [string, Material] => [`look-${id}`, { id: `look-${id}`, origin: "sample", tone, ...m(kind, "", s, exp) }];

/** The sample cards by stored name (`look-<theme>`). */
export const SAMPLE_MATERIALS: Record<string, Material> = Object.fromEntries([
  sample("field-kit", "solid", "light", "#EFE8D8", { background: "#EFE8D8", boxShadow: `${ring("#2A2D33")}, inset 0 -3px 0 #D3C9B3` }),
  sample("tape-86", "solid", "light", "#F3EDDD", { background: "radial-gradient(rgba(42,37,35,.06) 1px, transparent 1.2px) 0 0/10px 10px, #F3EDDD", boxShadow: `${ring("#2A2523", 2)}, inset -4px -4px 0 0 rgba(42,37,35,.16)` }),
  sample("neon-stripe", "glass", "dark", "#0D0B14", { background: "rgba(13,11,20,.84)", boxShadow: ring("rgba(127,217,212,.16)") }),
  sample("overdrive", "gradient", "dark", "#110F14", { background: `${CHAMFER_EDGES}, linear-gradient(160deg,#151318,#0C0B0E)`, boxShadow: `${ring("rgba(243,230,0,.7)")}, inset 0 0 12px -8px rgba(243,230,0,.5)`, clipPath: CHAMFER }),
  sample("swiss-mono", "solid", "dark", "#141414", { background: "#141414", boxShadow: "inset 0 -1px 0 #2E2D2A" }),
  sample("term", "lcd", "dark", "#0A0D0A", { background: "repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 1px, transparent 1px 3px), #0A0D0A", boxShadow: ring("#3F6B37"), textShadow: "0 0 6px rgba(139,227,122,.35)" }),
  sample("holo", "glass", "dark", "#050F18", { background: `${BRACKETS}, rgba(2,10,18,.82)`, boxShadow: ring("rgba(79,216,255,.16)") }),
  sample("night-glow", "glass", "dark", "#080A28", { background: "linear-gradient(135deg, rgba(4,6,24,.72), rgba(14,5,36,.72))", boxShadow: `${ring("rgba(62,230,255,.55)", 1.5)}, inset 0 0 12px rgba(155,92,255,.22)`, ...blur(12) }),
  sample("paper", "solid", "light", "#FFFFFF", { background: "#FFFFFF", boxShadow: `${ring("#E2DCD2")}, inset 0 -2px 0 rgba(31,27,46,.06)` }),
  sample("classy-black", "solid", "dark", "#050505", { background: "#050505", boxShadow: ring("rgba(255,255,255,.14)") }),
  sample("liquid-glass", "glass", "dark", "#0F0B1A", { background: "linear-gradient(145deg, rgba(12,8,24,.55), rgba(6,6,14,.5))", boxShadow: `inset 0 1px 0 rgba(255,255,255,.28), ${ring("rgba(255,255,255,.12)")}`, ...blur(24) }),
  sample("black-and-gold", "gradient", "dark", "#12100A", { background: "linear-gradient(160deg,#17130b,#0a0906)", boxShadow: `${ring("rgba(212,175,55,.5)")}, inset 0 0 12px -6px rgba(212,175,55,.5)` }),
  // Cyberspec's panel: the kit's panel fill and a frame line of 55 % accent over it, mixed from the card's accent so a variant recolours it; the cut corner is the pack's frame.
  sample("cyberspec", "solid", "dark", "#0E0E17", { background: "#0E0E17", boxShadow: ring("color-mix(in srgb, var(--w-accent) 55%, #0E0E17)") }),
]);

/**
 * Puts the cards where `resolveSurface` looks (it draws the default card for a name it does not know), and the sample
 * Looks' values where the style resolution looks for a level's Look (`lookLayers`).
 */
export const registerSampleCards = (): void => {
  Object.assign(sampleCards, SAMPLE_MATERIALS);
  for (const t of SAMPLE_THEMES) lookLayers[t.id] = sampleStyle(t);
};
