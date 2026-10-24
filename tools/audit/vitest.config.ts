import { defineConfig } from "vitest/config";
import base from "../../vite.config";

// On-demand audits (`npm run audit:views`): reports, not tests, so `npm test` never runs them. The base config is a
// function of the mode (the stats build), so it is called rather than spread.
export default defineConfig((env) => {
  const config = base(env);
  return { ...config, test: { ...config.test, include: ["tools/audit/*.audit.tsx"] } };
});
