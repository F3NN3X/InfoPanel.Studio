// A built-in pack's script from the bundle (src/looks/pack-script/builtin.ts): the text of the file its pack.json names, and nothing
// for a name that is not a built-in pack's script. Built-in packs carry it as data the pack loader passes on, never as a served file.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadPack } from "@/looks/pack-load";
import { builtinScript } from "@/looks/pack-script/builtin";

describe("a built-in pack's script", () => {
  it("is the text of the file in its pack's assets", async () => {
    expect(await builtinScript("cyberspec", "fx.js")).toBe(readFileSync("src/looks/packs/cyberspec/assets/fx.js", "utf8"));
  });

  it("is nothing for another pack, another file or a path out of the folder", async () => {
    expect(await builtinScript("field-kit", "fx.js")).toBeUndefined();
    expect(await builtinScript("cyberspec", "other.js")).toBeUndefined();
    expect(await builtinScript("cyberspec", "../../pack-script/builtin.ts")).toBeUndefined();
    expect(await builtinScript("../packs/cyberspec", "fx.js")).toBeUndefined();
  });

  it("reaches the loaded pack as its script key, and is not among the files the pack serves", async () => {
    const pack = (await loadPack("cyberspec"))!;
    expect(pack.script).toEqual({ file: "fx.js" });
    expect((pack.assets ?? []).some((a) => a.endsWith(".js"))).toBe(false);
    expect((await loadPack("field-kit"))!.script).toBeUndefined();
  });
});
