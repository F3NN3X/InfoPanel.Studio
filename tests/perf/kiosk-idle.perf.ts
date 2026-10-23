import { manifest, test } from "../e2e/fixtures";
import { measurePage, writeResult } from "./measure";

// Kiosk idle cost: the heavy and light profiles at the default Max FPS (60) and at &fps=30.
const CASES = [
  { name: "heavy", profile: manifest.profiles.heavy, query: "" },
  { name: "heavy-fps30", profile: manifest.profiles.heavy, query: "&fps=30" },
  { name: "light", profile: manifest.profiles.light, query: "" },
  { name: "light-fps30", profile: manifest.profiles.light, query: "&fps=30" },
];

test("kiosk-idle", async ({ browser, scratch }, info) => {
  const viewport = info.project.use.viewport ?? { width: 1920, height: 550 };
  const cases: Record<string, unknown> = {};
  for (const c of CASES) {
    cases[c.name] = await measurePage(browser, `${scratch.base}/?kiosk=1&profile=${c.profile}${c.query}`, manifest.kioskZoneSelector, viewport);
  }
  writeResult("kiosk-idle", { cases });
});
