import { describe, expect, it } from "vitest";
import { writeZip } from "@/lib/infopanel/zip";
import { exportPackage, importPackage, packageOf } from "@/widgets/recipe/package";
import { withFormat } from "@/components/widgets-page/builder-model";
import { checkPackage } from "@/widgets/recipe/validate";
import type { Block } from "@/widgets/recipe/types";
import { FIXTURE_NAMES, fixtureFiles, fixtureImages, fixtureRecipe } from "./fixture-files";

// A widget package's round trip: export writes a .zip of the manifest and the files; import reads it back to the same files, byte for
// byte, and the validator passes them again. (The server's half, import then each file served as it went in, is routes_widgets.rs.)
describe("widget packages", () => {
  it.each(FIXTURE_NAMES)("%s: export -> import -> the same bytes, and it validates", async (name) => {
    const files = await packageOf(fixtureRecipe(name), fixtureImages(name));
    const back = await importPackage(exportPackage(files));
    expect(back.skipped).toEqual([]);
    expect(back.files.map((f) => f.path)).toEqual(files.map((f) => f.path));
    for (const f of files) expect(back.files.find((b) => b.path === f.path)?.bytes, f.path).toEqual(f.bytes);
    expect((await checkPackage({ files: back.files })).issues).toEqual([]);
    // and a second export of what came back is the same archive
    expect(exportPackage(back.files)).toEqual(exportPackage(files));
  });

  it("lists the manifest first, then every file in path order with its size and SHA-256", async () => {
    const files = await packageOf(fixtureRecipe("gpu-card"), fixtureImages("gpu-card"));
    expect(files.map((f) => f.path)).toEqual(["manifest.json", "recipe.json", "images/logo.png"]);
    const manifest = JSON.parse(new TextDecoder().decode(files[0].bytes));
    expect(manifest).toMatchObject({ format: 1, kind: "recipe", id: "recipe:gpu-card", version: "1.0.0", author: "InfoPanel Studio" });
    expect(manifest.files.map((f: { path: string }) => f.path)).toEqual(["images/logo.png", "recipe.json"]);
    expect(manifest.signature).toBeUndefined();
  });

  it("takes one top folder off and leaves out what a package does not hold", async () => {
    const zip = writeZip([...fixtureFiles("cpu-card").map((f) => ({ name: `cpu-card/${f.path}`, data: f.bytes })), { name: "cpu-card/notes.txt", data: new Uint8Array([1]) }, { name: "cpu-card/bundle.js", data: new Uint8Array([1]) }]);
    const back = await importPackage(zip);
    expect(back.files.map((f) => f.path).sort()).toEqual(["manifest.json", "recipe.json"]);
    expect(back.skipped).toEqual(["cpu-card/notes.txt", "cpu-card/bundle.js"]);
  });
});

describe("format 2 in a package (Phase A)", () => {
  it("a recipe with parts goes out and back as format 2, byte for byte; one without new keys stays format 1, byte for byte", async () => {
    const weather = await packageOf(withFormat(fixtureRecipe("weather-places")));
    expect(JSON.parse(new TextDecoder().decode(weather[1].bytes)).format).toBe(2);
    const back = await importPackage(exportPackage(weather));
    for (const f of weather) expect(back.files.find((b) => b.path === f.path)?.bytes, f.path).toEqual(f.bytes);
    for (const name of ["cpu-card", "gpu-card"] as const) {
      const r = fixtureRecipe(name);
      expect(withFormat(r)).toBe(r);
      expect((await packageOf(withFormat(r), fixtureImages(name))).map((f) => f.bytes)).toEqual(fixtureFiles(name).map((f) => f.bytes));
    }
  });
});

describe("Phase C keys in a package", () => {
  it("a recipe with every Phase C key goes out and back as format 2, byte for byte, and validates", async () => {
    const r = fixtureRecipe("cpu-card");
    const top = r.root.children[0] as Extract<Block, { type: "row" }>;
    const values = top.children[1] as Extract<Block, { type: "row" }>;
    Object.assign(top.children[0], { tone: "muted", thresholds: { warn: 30, crit: 10, low: true } });
    Object.assign(values.children[1], { convert: "GHz", decimals: 2, align: "center", color: "muted" });
    r.root.children.push({ type: "label", text: "Clock in GHz", align: "end" });
    const files = await packageOf(withFormat(r));
    expect(JSON.parse(new TextDecoder().decode(files[1].bytes)).format).toBe(2);
    const back = await importPackage(exportPackage(files));
    for (const f of files) expect(back.files.find((b) => b.path === f.path)?.bytes, f.path).toEqual(f.bytes);
    expect((await checkPackage({ files: back.files })).issues).toEqual([]);
    expect(exportPackage(back.files)).toEqual(exportPackage(files));
  });
});
