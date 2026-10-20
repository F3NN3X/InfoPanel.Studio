import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const run = promisify(execFile);

// No test imports server.mjs (it starts listening), so a syntax error there would pass the suite.
describe("server files parse", () => {
  const files = ["server.mjs", ...fs.readdirSync(path.join(root, "server")).filter((f) => f.endsWith(".mjs")).map((f) => path.join("server", f))];
  it("every file passes node --check", async () => {
    // The checks run side by side; collecting the failures names the bad file in the one assertion.
    const results = await Promise.all(files.map((file) => run(process.execPath, ["--check", path.join(root, file)]).then(() => null, () => file)));
    expect(results.filter(Boolean)).toEqual([]);
  });
});
