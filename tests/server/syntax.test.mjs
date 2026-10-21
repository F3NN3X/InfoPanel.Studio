import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "../setup/repo-root.mjs";
import { parseAst } from "rollup/parseAst";
import { describe, expect, it } from "vitest";

const root = repoRoot;

// No test imports server.mjs (it starts listening), so a syntax error there would pass the suite.
describe("server files parse", () => {
  const files = ["server.mjs", ...fs.readdirSync(path.join(root, "server")).filter((f) => f.endsWith(".mjs")).map((f) => path.join("server", f))];
  it("every file parses", () => {
    // Parsed in this process (no `node --check` child per file); collecting the failures names the bad file in the one assertion.
    const bad = files.filter((file) => {
      try {
        parseAst(fs.readFileSync(path.join(root, file), "utf8"));
        return false;
      } catch {
        return true;
      }
    });
    expect(bad).toEqual([]);
  });
});
