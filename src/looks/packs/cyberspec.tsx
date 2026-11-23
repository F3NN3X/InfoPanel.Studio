// Cyberspec: after the Cyberspec kit by Agnel Nieves (MIT, licences/cyberspec-MIT.txt), the worked example of what a pack can do. Its panel
// is the app's frame (the bottom right cut, a spine, both at the kit's 55 % line), its solid panel bar the `label-bar` header, its micro-print
// and reticle the app's ornaments, its type, signal-cyan values, badge cuts, hatch and lamp the pack's CSS, its glitch-in, decode and
// scramble the `motion` block, and its CRT treatment the stage's static scanlines and vignette with a rare glitch, all gone at Calm and Off
// as the kit's are. The variants are the kit's six themes, each deriving its inks from its accent. Lucide is the kit's icon set, so the Classic set stays.
import type { Look } from "../look";
import { builtPack, packFiles, type PackMeta } from "../pack-assets";
import look from "./cyberspec/look.json";
import meta from "./cyberspec/pack.json";
import css from "./cyberspec/pack.css?raw";

const files = packFiles(import.meta.glob<string>("./cyberspec/assets/*", { query: "?url&no-inline", import: "default", eager: true }));

export default builtPack(meta as PackMeta, look as unknown as Look, files, { css, slots: {} });
