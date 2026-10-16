// Checks the .NET formatting port against real .NET 8 output
// (scripts/dotnet-reference.cs → __fixtures__/dotnet-reference.json).
import { describe, expect, it } from "vitest";
import { formatDate, formatFixed, formatN, FormatError, parseAnyInvariant } from "./dotnet-format.ts";
import ref from "./__fixtures__/dotnet-reference.json";

const num = (s: string) => Number(s);

describe("formatFixed and formatN match .NET 8", () => {
  it.each(ref.fixed.map((r) => [r.v, r] as const))("%s", (v, row) => {
    const x = num(v);
    expect([0, 1, 2, 3].map((d) => formatFixed(x, d))).toEqual([row.f0, row.f1, row.f2, row.f3]);
    expect(formatFixed(Math.floor(x), 0)).toBe(row.floor);
    expect([0, 1, 2, 3].map((d) => formatN(x, d))).toEqual([row.n0, row.n1, row.n2, row.n3]);
  });
});

describe("parseAnyInvariant matches double.TryParse(NumberStyles.Any, Invariant)", () => {
  it.each(ref.parse.map((r) => [JSON.stringify(r.s), r] as const))("%s", (_, row) => {
    const parsed = parseAnyInvariant(row.s);
    expect(parsed !== null).toBe(row.ok);
    if (row.ok) expect(parsed).toBe(num(row.v!));
  });
});

describe("formatDate matches DateTime.ToString under en-US", () => {
  const dates = ref.dates.map((s) => {
    const [, y, mo, d, h, mi, sec, ms] = /^(\d+)-(\d+)-(\d+)T(\d+):(\d+):(\d+)\.(\d+)$/.exec(s)!.map(Number);
    return new Date(y, mo - 1, d, h, mi, sec, ms);
  });

  it.each(ref.formats.map((r) => [JSON.stringify(r.f), r] as const))("%s", (_, row) => {
    const got = dates.map((d) => {
      try {
        return formatDate(d, row.f);
      } catch (e) {
        if (e instanceof FormatError) return "!error";
        throw e;
      }
    });
    expect(got).toEqual(row.outputs);
  });
});
