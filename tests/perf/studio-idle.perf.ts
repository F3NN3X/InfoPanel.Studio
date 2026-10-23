import { test } from "../e2e/fixtures";
import { measurePage, openDesign, STUDIO_READY, writeResult } from "./measure";

// Studio idle cost: the Design view on the heavy profile, on first load. HEADED=1 runs it in a visible window.

test("studio-idle", async ({ browser, scratch }, info) => {
  const viewport = info.project.use.viewport ?? { width: 1440, height: 860 };
  const design = await measurePage(browser, `${scratch.base}/?studio=1`, STUDIO_READY, viewport, openDesign);
  writeResult("studio-idle", { cases: { design } });
});
