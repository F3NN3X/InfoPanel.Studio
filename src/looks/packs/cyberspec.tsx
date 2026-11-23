// Cyberspec: after the Cyberspec kit by Agnel Nieves (MIT, licences/cyberspec-MIT.txt). Its one shape is the app's `cut` frame (the bottom
// right, the kit's bare `data-frame`), its solid panel bar the `label-bar` header, its micro-print and reticle the app's ornaments, and its
// CRT treatment the stage's static scanlines and vignette with a rare glitch, all gone at Calm and Off as the kit's are. The variants are
// the kit's other five themes (accent only: Crimson is the Look's own). Lucide is the kit's icon set, nothing of its own, so the Classic set stays.
import type { Look } from "../look";
import { builtPack, packFiles, type PackMeta } from "../pack-assets";
import look from "./cyberspec/look.json";
import meta from "./cyberspec/pack.json";
import css from "./cyberspec/pack.css?raw";

const files = packFiles(import.meta.glob<string>("./cyberspec/assets/*", { query: "?url&no-inline", import: "default", eager: true }));

export default builtPack(meta as PackMeta, look as unknown as Look, files, { css, slots: {} });
