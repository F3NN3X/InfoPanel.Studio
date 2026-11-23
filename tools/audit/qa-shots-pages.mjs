// `qa:shots --pages`: one full-window PNG per Studio view, browser Settings page and the primitives preview, for comparing
// the UI cleanup sweep page by page (brief Phase 5, step 6). Same scratch server, fixed clock and reduced motion as the
// widget shots. The App pages of Settings need the desktop app and are not shot.
import fs from "node:fs";
import path from "node:path";

/** The pages, in sidebar order. `nav` is the Studio sidebar row's accessible name; `url` a query (and hash) to load. */
export const PAGES = [
  { name: "screens", nav: "Screens" },
  { name: "edit", nav: /^Edit / },
  { name: "theme", nav: "Theme" },
  { name: "library", nav: "Library" },
  { name: "widgets", nav: "Widgets" },
  { name: "gauges", nav: "Gauges" },
  { name: "alerts", nav: "Alerts & Island" },
  { name: "data", nav: "Data sources" },
  { name: "settings-dashboard", url: "?settings#dashboard" },
  { name: "settings-studio", url: "?settings#studio" },
  { name: "ui-preview", url: "?ui-preview" },
];

/** Shoot every page into `dir`; returns the count. `only` narrows to page names. */
export async function shootPages(browser, base, dir, only = []) {
  const pages = only.length ? PAGES.filter((p) => only.includes(p.name)) : PAGES;
  fs.mkdirSync(dir, { recursive: true });
  let count = 0;
  for (const p of pages) {
    // A fresh context per page: no remembered sidebar, tab or scroll leaks from the page before.
    const context = await browser.newContext({ viewport: { width: 1500, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    try {
      // Clocks and "x min ago" draw the same every run. Live readings (the Data API's latency, sensor values in previews,
      // gauges and Data sources) still differ between runs, so read a changed page by eye. A paused clock stalls the boot.
      await page.clock.setFixedTime(new Date("2026-06-01T12:00:00"));
      if (p.url) {
        await page.goto(`${base}/${p.url}`);
      } else {
        await page.goto(`${base}/?studio=1`);
        await page.getByRole("navigation", { name: "Studio views" }).getByRole("button", { name: p.nav }).click();
      }
      // The studio keeps a live stream open, so the network never goes idle: wait for fonts, then let lazy views settle.
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(dir, `${p.name}.png`), animations: "disabled", caret: "hide" });
      count++;
    } finally {
      await context.close();
    }
  }
  return count;
}
