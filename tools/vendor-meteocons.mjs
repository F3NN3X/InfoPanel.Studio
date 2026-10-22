// Copies the weather subset of Meteocons (MIT, (c) Bas Milius) into src/assets/meteocons.
// Usage: node tools/vendor-meteocons.mjs <extracted folder holding a/package and s/package>
//   a = @meteocons/svg (animated), s = @meteocons/svg-static (static), both 0.1.0, each extracted from `npm pack`.
// Keep NAMES in step with meteoconName() in src/lib/weather-icons.ts.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const src = process.argv[2];
if (!src) {
  console.error("usage: node tools/vendor-meteocons.mjs <extracted folder>");
  process.exit(1);
}
const out = resolve(dirname(fileURLToPath(import.meta.url)), "../src/assets/meteocons");
const STYLES = ["fill", "flat", "line", "monochrome"];
const FORMATS = { animated: "a", static: "s" };
const PRECIP = ["drizzle", "rain", "sleet", "snow", "hail"];
const NAMES = [
  "clear-day", "clear-night", "partly-cloudy-day", "partly-cloudy-night", "cloudy", "overcast-day", "overcast-night",
  "fog-day", "fog-night", "extreme-day-rain", "extreme-night-rain", "thunderstorms-day", "thunderstorms-night", "wind",
  ...["day", "night"].flatMap((t) => PRECIP.map((p) => `partly-cloudy-${t}-${p}`)),
];

let count = 0;
for (const style of STYLES)
  for (const [format, dir] of Object.entries(FORMATS))
    for (const name of NAMES) {
      const from = join(src, dir, "package", style, `${name}.svg`);
      if (!existsSync(from)) throw new Error(`missing ${from}`);
      const to = join(out, style, format, `${name}.svg`);
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
      count++;
    }
console.log(`copied ${count} files to ${out}`);
