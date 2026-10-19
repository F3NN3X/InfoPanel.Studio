import { describe, expect, it } from "vitest";
import { STARTERS } from "./presets.ts";
import { readSpecFile, specFile } from "./spec-file.ts";

describe("gauge spec files", () => {
  it("round-trips every preset", () => {
    for (const s of STARTERS) expect(readSpecFile(specFile(s.name, s.gauge))).toEqual({ name: s.name, gauge: s.gauge });
  });

  it("refuses what is not a spec, and normalizes what is", () => {
    expect(() => readSpecFile("{")).toThrow("Not a JSON file");
    expect(() => readSpecFile('{"format":"other","gauge":{}}')).toThrow("Not a gauge spec");
    expect(() => readSpecFile('{"format":"infopanel-gauge","version":2,"gauge":{}}')).toThrow("newer");
    const r = readSpecFile('{"format":"infopanel-gauge","version":1,"name":"a\\u0000b","gauge":{"shape":"bar","width":99999,"track":"evil"}}');
    expect(r.name).toBe("ab");
    expect(r.gauge).toMatchObject({ shape: "bar", width: 2048, track: "#1E293B" });
  });
});
