import { describe, expect, it } from "vitest";
import { breaches, limitOf } from "../../../tools/perf/check-budgets.mjs";

const b = { kioskEntryGzipBytes: 1000, studioEntryGzipBytes: 2000, entryGzipSlack: 0.01, kioskServerRendererAllowed: false };
const result = (kiosk, studio, extra = {}) => ({ entries: { kiosk: { jsGzip: kiosk, serverRenderer: false, ...extra }, studio: { jsGzip: studio } } });

describe("check-budgets", () => {
  it("lets an entry go over its budget by the slack, and no further", () => {
    expect(limitOf(1000, b)).toBe(1010);
    expect(breaches(result(1010, 2020), b)).toEqual([]);
    expect(breaches(result(1011, 2021), b)).toEqual(["kiosk entry 1011 B gzip > 1010 (budget 1000 + slack)", "studio entry 2021 B gzip > 2020 (budget 2000 + slack)"]);
  });

  it("holds an entry to its exact budget when no slack is set", () => {
    const exact = { ...b, entryGzipSlack: undefined };
    expect(breaches(result(1001, 2000), exact)).toEqual(["kiosk entry 1001 B gzip > 1000 (budget 1000 + slack)"]);
  });

  it("still refuses the server renderer in the kiosk whatever the size", () => {
    expect(breaches(result(10, 10, { serverRenderer: true }), b)).toEqual(["react-dom/server code is in the kiosk closure"]);
  });
});
