import { defineConfig } from "vitest/config";
import base from "../../vite.config";

// On-demand audits (`npm run audit:views`): reports, not tests, so `npm test` never runs them.
export default defineConfig({ ...base, test: { ...base.test, include: ["tools/audit/*.audit.tsx"] } });
