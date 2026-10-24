# Widget library: documentation

Follow the links:
1. **[ARCHITECTURE.md](ARCHITECTURE.md):** folder layout, the rendering contract, shell props, sizing rules, data flow, performance rules and app integration steps.
2. **[AUDIT.md](AUDIT.md):** what was consolidated for reuse, the remaining consolidation to do while porting, and the consistency rules.
3. **[DESIGN_TOKENS.md](DESIGN_TOKENS.md):** colours, state colours, ramps, typography, radii, spacing and motion.
4. **[PRIMITIVES.md](PRIMITIVES.md):** every shared component and helper, with its signature.
5. **[VARIANTS.md](VARIANTS.md):** the `default` and `studio` variants, plus the per-widget layout options.
6. **[SKINS.md](SKINS.md)**: one doc per skin in [skins/](skins/), and one code file per skin in `core/skins/<name>.js` (tokens + native surfaces + fonts). Also **[SURFACES.md](SURFACES.md)**: generic surfaces live in `core/surfaces.js`.
7. **[WIDGETS.md](WIDGETS.md)** with one spec per widget in **[widgets/](widgets/)**. Each spec covers the file, span, props, data keys, sizes, descriptors and the primitives it uses.

The live reference is `Widget Templates.dc.html`. Every widget, gallery, skin, surface and variant is on that page, grouped by category, with controls for variant, skin, surface, graph, meter, accent, radius, cell size and live data.

`docs/.facts.json` is the machine-readable source behind the generated pages (skins, surfaces, ramps, catalogue, meta). Regenerate the docs from it when tokens change.
