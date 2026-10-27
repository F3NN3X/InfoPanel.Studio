import { describe, expect, it } from "vitest";
import { parseRecent, withRecent } from "@/components/studio/add-recent";

describe("Recently used", () => {
  it("keeps the last four distinct keys of any kind, newest first", () => {
    expect(withRecent(["a", "item:Text", "c", "element:ring"], "d")).toEqual(["d", "a", "item:Text", "c"]);
    expect(withRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
  });

  it("reads only an array of strings from storage", () => {
    expect(parseRecent('["a","b"]')).toEqual(["a", "b"]);
    expect(parseRecent('["a",1,"b","c","d","e"]')).toEqual(["a", "b", "c", "d"]);
    expect(parseRecent("{bad")).toEqual([]);
    expect(parseRecent('{"a":1}')).toEqual([]);
    expect(parseRecent(null)).toEqual([]);
  });
});
