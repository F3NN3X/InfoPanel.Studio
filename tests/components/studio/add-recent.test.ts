import { describe, expect, it } from "vitest";
import { parseRecent, withRecent } from "@/components/studio/add-recent";

describe("Recent widgets", () => {
  it("keeps the last three distinct ids, newest first", () => {
    expect(withRecent(["a", "b", "c"], "d")).toEqual(["d", "a", "b"]);
    expect(withRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
  });

  it("reads only an array of strings from storage", () => {
    expect(parseRecent('["a","b"]')).toEqual(["a", "b"]);
    expect(parseRecent('["a",1,"b","c","d"]')).toEqual(["a", "b", "c"]);
    expect(parseRecent("{bad")).toEqual([]);
    expect(parseRecent('{"a":1}')).toEqual([]);
    expect(parseRecent(null)).toEqual([]);
  });
});
