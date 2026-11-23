// User packs (P12b): read from the route, validated in user mode, registered like a built-in pack; and the importer's checks.
// A fake `fetch` serves a folder of files the way `GET /api/packs/<id>/<file>` does.
import { afterEach, describe, expect, it, vi } from "vitest";
import { isLookId, LOOK_IDS } from "@/looks/ids";
import { cssColour } from "@/looks/colour";
import { PACK_CEILING_BYTES } from "@/looks/pack-validate";
import { resolveMaterial } from "@/looks/materials";
import { loadPack, sharedPack, unregisterUserPack } from "@/looks/pack-load";
import { PACK_IDS } from "@/looks/pack";
import { lookLayers, sampleCards, userLookIds } from "@/looks/sample-cards";
import { checkImport, describeIssue, filesOfInput, filesOfZip, sourceOf, withoutRoot, type PickedFile } from "@/looks/user-pack-import";
import { readFileSync } from "node:fs";
import { lookUses, USER_PACKS_MAX, withoutLookId } from "@/looks/user-pack-config";
import { cardOf, fontCss, forgetUserPack, listUserPacks, registerUserPacks, USER_PACK_ID } from "@/looks/user-packs";
import { readPackDir } from "../../tools/validate-pack.mjs";

// biome-ignore lint/suspicious/noExplicitAny: fixtures edit parsed JSON of any shape.
type Json = any;
const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

/** Field Kit's folder as a user's own pack `id`: new id and font families, no pack.css, every asset listed. */
function folder(id: string, edit: (files: Map<string, Uint8Array>, pack: Json, look: Json) => void = () => {}): PickedFile[] {
  const src = readPackDir("src/looks/packs/field-kit", /\.tsx?$/);
  const files = new Map<string, Uint8Array>(src.files.filter((f: Json) => f.path !== "pack.css").map((f: Json) => [f.path, f.bytes]));
  const pack = structuredClone(src.pack) as Json;
  const look = structuredClone(src.look) as Json;
  pack.id = look.id = id;
  pack.fonts = pack.fonts.map((f: Json) => ({ ...f, family: f.family.replace("pack-", `pack-${id}-`) }));
  for (const k of Object.keys(look.fonts)) look.fonts[k] = look.fonts[k].replace("pack-", `pack-${id}-`);
  pack.assets = [...files].filter(([p]) => p.startsWith("assets/")).map(([p, b]) => ({ file: p.slice(7), bytes: b.length }));
  edit(files, pack, look);
  files.set("pack.json", enc(JSON.stringify(pack)));
  files.set("look.json", enc(JSON.stringify(look)));
  return [...files].map(([path, bytes]) => ({ path, bytes }));
}

/** `fetch` over in-memory packs: `/api/packs` lists them, `/api/packs/<id>/<file>` serves a file (the server's own refusals are the server's tests). */
function serve(packs: Record<string, PickedFile[]>) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/packs") return new Response(JSON.stringify(Object.keys(packs).map((id) => ({ id, name: id, size: 1 }))));
    const [, , , id, ...rest] = url.split("/");
    const file = packs[id]?.find((f) => f.path === rest.join("/"));
    return file ? new Response(file.bytes as BodyInit) : new Response("", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const id of ["mine", "mine2", "bad"]) forgetUserPack(id);
});

describe("reading a user pack from the route", () => {
  it("lists ids that match the route's pattern and drops the rest", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify([{ id: "mine", name: "Mine", size: 10 }, { id: "../x", name: "x" }, { id: "A", name: "x" }, { id: "ok-2", size: "3" }, "nope"])));
    expect(await listUserPacks()).toEqual([{ id: "mine", name: "Mine", size: 10 }, { id: "ok-2", name: "ok-2", size: 3 }]);
    vi.stubGlobal("fetch", async () => new Response("", { status: 500 }));
    expect(await listUserPacks()).toEqual([]);
    vi.stubGlobal("fetch", async () => Promise.reject(new Error("offline")));
    expect(await listUserPacks()).toEqual([]);
  });

  it("an oklch token reaches the Look layer as the clamped hex the validator checked", async () => {
    serve({ mine: folder("mine", (_f, _p, look) => (look.t1[look.modes.supported[0]].accent.value = "oklch(0.45 0.15 30)")) });
    expect(await registerUserPacks(["mine"])).toEqual(["mine"]);
    expect(lookLayers.mine?.accent).toBe(cssColour("oklch(0.45 0.15 30)"));
    expect(lookLayers.mine?.accent).toMatch(/^#[\da-f]{6}$/);
  });

  it("a valid pack becomes a Look id, a card, a Look layer and a pack the loader accepts", async () => {
    serve({ mine: folder("mine") });
    expect(isLookId("mine")).toBe(false);
    expect(await registerUserPacks(["mine"])).toEqual(["mine"]);
    expect(isLookId("mine")).toBe(true);
    expect(PACK_IDS.has("mine")).toBe(true);
    expect(sampleCards["look-mine"]?.tone).toBe("light");
    expect(lookLayers.mine?.surface).toBe("look-mine");
    const pack = await sharedPack("mine");
    expect(pack?.id).toBe("mine");
    expect(pack?.base).toBe("/api/packs/mine/assets/");
    expect(pack?.chrome).toBeDefined();
    expect(pack?.css).toContain("pack-mine-");
    // the same pack through the loader's own refusals, with its CSS (the font rules) read like any pack's
    expect(await loadPack("mine", { mine: async () => ({ default: pack! }) })).toBeDefined();
  });

  it("only the requests the pack needs, all to the route", async () => {
    const fetchMock = serve({ mine: folder("mine") });
    await registerUserPacks(["mine"]);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.length).toBeGreaterThan(3);
    expect(urls.every((u) => u.startsWith("/api/packs/mine/"))).toBe(true);
  });

  it("a pack with an error is not registered, and its Look is not one", async () => {
    serve({
      bad: folder("bad", (_f, _p, look) => (look.t2.materials["look-field-kit"].tone = "auto")),
      mine2: folder("mine2", (_f, pack) => (pack.stage.layers[0] = { image: "https://x.test/a.svg" })),
    });
    expect(await registerUserPacks(["bad", "mine2"])).toEqual([]);
    expect(isLookId("bad")).toBe(false);
    expect(await sharedPack("bad")).toBeUndefined();
  });

  it("a pack that names a built-in id or font family is refused, and the built-in is not replaced", async () => {
    serve({ paper: folder("paper"), mine: folder("mine", (_f, pack) => (pack.fonts[0].family = "pack-paper")) });
    expect(await registerUserPacks(["paper", "mine"])).toEqual([]);
    expect(PACK_IDS.has("paper")).toBe(true);
    expect(LOOK_IDS).toContain("paper");
    // and an id of a built-in never reaches the register even when the validator would pass it
    expect(await registerUserPacks(["classic"])).toEqual([]);
  });

  it("what the pack says about itself does not change how it is read: the mode is the loader's", async () => {
    // a pack.json with a `source: builtin` claim is not a pack (extra key), and one that keeps a built-in's font family is refused
    serve({ mine: folder("mine", (_f, pack) => (pack.source = "builtin")), mine2: folder("mine2", (_f, pack) => (pack.fonts[0].family = "pack-classy")) });
    expect(await registerUserPacks(["mine", "mine2"])).toEqual([]);
  });

  it("forgetting a pack takes its id, card and layer away", async () => {
    serve({ mine: folder("mine") });
    await registerUserPacks(["mine"]);
    forgetUserPack("mine");
    expect(isLookId("mine")).toBe(false);
    expect(sampleCards["look-mine"]).toBeUndefined();
    expect(lookLayers.mine).toBeUndefined();
    expect(await sharedPack("mine")).toBeUndefined();
    unregisterUserPack("mine");
  });
});

describe("a pack that goes away", () => {
  it("takes its font faces out of the document", async () => {
    const faces = { added: [] as unknown[], removed: [] as unknown[] };
    vi.stubGlobal("FontFace", class {});
    vi.stubGlobal("document", { fonts: { add: (f: unknown) => faces.added.push(f), delete: (f: unknown) => faces.removed.push(f) } });
    serve({ mine: folder("mine") });
    await registerUserPacks(["mine"]);
    expect(faces.added.length).toBeGreaterThan(0);
    forgetUserPack("mine");
    expect(faces.removed).toEqual(faces.added);
  });

  it("a dangling lookId is Classic: a bounded number of requests, no pack, no crash", async () => {
    const fetchMock = serve({});
    const config = { profiles: [{ widgetTheme: { values: { lookId: "gone" } }, pages: [{ zones: [{ style: { lookId: "gone" } }] }] }] };
    expect(await registerUserPacks(userLookIds(config))).toEqual([]);
    expect(isLookId("gone")).toBe(false);
    expect(await sharedPack("gone")).toBeUndefined();
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
  });
});

describe("the card a pack's look.json describes", () => {
  const look = (material: Json) => ({ t2: { default: "m", materials: { m: material } } }) as Json;

  it("a glass card's blur is clamped and its fallback is never under 0.9", () => {
    const card = cardOf("mine", look({ kind: "glass", tone: "dark", fill: "#101010", "fill-alpha": 0.5, blur: "999px" }))!;
    expect(String(card.s.backdropFilter)).toContain("64px");
    const resolved = resolveMaterial(card);
    expect(resolved.fallback).toContain("0.9");
  });

  it("a gradient card, an edge and a light tone", () => {
    const card = cardOf("mine", look({ kind: "gradient", tone: "light", fill: "#FFFFFF", "fill-2": "#EEEEEE", "fill-angle": "90deg", border: "#102030" }))!;
    expect(card.s.background).toBe("linear-gradient(90deg, rgba(255, 255, 255, 1), rgba(238, 238, 238, 1))");
    expect(card.s.boxShadow).toContain("rgba(16, 32, 48, 1)");
    expect(card.tone).toBe("light");
  });

  it("an angle that is not a plain degree value is not written into the style", () => {
    const card = cardOf("mine", look({ kind: "gradient", fill: "#000000", "fill-2": "#111111", "fill-angle": "1deg); x:(" }))!;
    expect(String(card.s.background)).toContain("155deg");
  });

  it("the font rules are the loader's own, from the families the Look names", () => {
    expect(fontCss({ body: "pack-a", display: "pack-b" })).toBe('* { font-family: pack-a, system-ui, sans-serif; }\n[data-part="num"] { font-family: pack-b, pack-a, system-ui, sans-serif; }\n');
  });

  it("the route's id pattern", () => {
    for (const ok of ["a", "my-pack", "0x"]) expect(USER_PACK_ID.test(ok)).toBe(true);
    for (const bad of ["", "-a", "A", "a_b", "../x", "a".repeat(49)]) expect(USER_PACK_ID.test(bad)).toBe(false);
  });
});

describe("a config that names a pack this build does not have", () => {
  it("userLookIds finds the ids to look for and leaves the Looks of the registry", () => {
    const config = { profiles: [{ widgetTheme: { values: { lookId: "mine" } }, pages: [{ zones: [{ style: { lookId: "classic" } }, { style: { lookId: "paper" } }, { style: { lookId: "mine" } }, { style: { lookId: "Bad Id" } }] }] }] };
    expect(userLookIds(config)).toEqual(["mine"]);
  });

  it("userLookIds keeps as many ids as the server stores packs, and the two numbers agree", () => {
    const rust = readFileSync("src-tauri/crates/ips-server/src/packs.rs", "utf8");
    expect(Number(/pub const PACKS_MAX: usize = (\d+);/.exec(rust)?.[1])).toBe(USER_PACKS_MAX);
    const config = { list: Array.from({ length: USER_PACKS_MAX + 3 }, (_, k) => ({ lookId: `mine-${k}` })) };
    expect(userLookIds(config)).toHaveLength(USER_PACKS_MAX);
  });

  it("lookUses counts the places and withoutLookId takes them out (Classic is drawn there)", () => {
    const config = { a: { lookId: "mine", surface: "look-mine" }, b: [{ style: { lookId: "mine" } }, { style: { lookId: "paper" } }], c: "mine" };
    expect(lookUses(config, "mine")).toBe(2);
    const after = withoutLookId(config, "mine");
    expect(lookUses(after, "mine")).toBe(0);
    expect(after.b[1].style.lookId).toBe("paper");
    expect(config.a.lookId).toBe("mine");
  });
});

describe("the importer", () => {
  it("a folder that is a good pack passes, a pick with its top folder is read the same", () => {
    const files = folder("mine");
    expect(checkImport(files)).toMatchObject({ ok: true, id: "mine" });
    expect(checkImport(files.map((f) => ({ ...f, path: `my-pack/${f.path}` }))).ok).toBe(true);
    expect(checkImport(files.map((f) => ({ ...f, path: `my-pack\\${f.path.replace(/\//g, "\\")}` }))).ok).toBe(true);
  });

  it("errors refuse the pack and say which rule in plain words", () => {
    const withCss = [...folder("mine"), { path: "pack.css", bytes: enc("a{}") }];
    const report = checkImport(withCss);
    expect(report.ok).toBe(false);
    expect(report.issues.map(describeIssue).join(" ")).toContain("cannot bring its own stylesheet");
    const hostile = checkImport(folder("mine", (f) => f.set("assets/hazard.svg", enc('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))));
    expect(hostile.ok).toBe(false);
    expect(hostile.issues.find((i) => i.rule === "svg-unsafe")).toBeDefined();
    expect(checkImport(folder("mine", (_f, pack) => (pack.id = "Bad Id"))).ok).toBe(false);
    expect(checkImport([]).ok).toBe(false);
  });

  it("files a pack does not have are left out and listed as notes", () => {
    const report = checkImport([...folder("mine"), { path: "README.md", bytes: enc("hi") }, { path: ".DS_Store", bytes: enc("x") }]);
    expect(report.ok).toBe(true);
    expect(report.issues.filter((i) => i.rule === "not-stored").map((i) => i.file).sort()).toEqual([".DS_Store", "README.md"]);
    expect(sourceOf(folder("mine")).skipped).toEqual([]);
  });

  it("a GIF asset is stored with the pack (P5), and an AVIF one is still left out", () => {
    const gif = new Uint8Array([...enc("GIF89a"), 1, 0, 1, 0, 0, 0, 0]);
    const files = folder("mine", (f, pack) => {
      f.set("assets/spark.gif", gif);
      f.set("assets/photo.avif", enc("x"));
      pack.assets.push({ file: "spark.gif", bytes: gif.length });
    });
    const report = checkImport(files);
    expect(report.issues.filter((i) => i.rule === "not-stored").map((i) => i.file)).toEqual(["assets/photo.avif"]);
    expect(sourceOf(files).skipped).toEqual(["assets/photo.avif"]);
  });

  it("a licence under another name is left out with the way to keep it", () => {
    const files = folder("mine").filter((f) => f.path !== "OFL.txt");
    const report = checkImport([...files, { path: "LICENSE.txt", bytes: enc("SIL OPEN FONT LICENSE Version 1.1") }]);
    expect(report.issues.find((i) => i.rule === "not-stored")?.message).toContain("rename it to OFL.txt");
  });

  it("a built-in's id is refused at import, and a missing pack.json gives errors, not a crash", () => {
    expect(checkImport(folder("paper")).ok).toBe(false);
    expect(checkImport([{ path: "x.txt", bytes: enc("x") }]).ok).toBe(false);
    expect(withoutRoot([{ path: "a.txt", bytes: enc("x") }])).toHaveLength(1);
  });

  it("a zip is read as a folder", async () => {
    const files = folder("mine").filter((f) => f.path === "pack.json" || f.path === "look.json");
    const zip = stored(files);
    const read = await filesOfZip(zip);
    expect(read.map((f) => f.path).sort()).toEqual(files.map((f) => f.path).sort());
    expect(dec(read.find((f) => f.path === "pack.json")!.bytes)).toContain('"id":"mine"');
  });
});

describe("a picked folder with files that are not part of a pack", () => {
  const picked = (path: string, bytes: number | Uint8Array) => {
    const file = new File([(typeof bytes === "number" ? new Uint8Array(bytes) : bytes) as BlobPart], path.split("/").pop()!);
    Object.defineProperty(file, "webkitRelativePath", { value: path });
    return file;
  };
  it("a big file the server would not store is left out unread, not a failure", async () => {
    const good = folder("mine").map((f) => picked(`mine/${f.path}`, f.bytes));
    const read = await filesOfInput([...good, picked("mine/preview.mp4", 3_000_000)] as unknown as FileList);
    expect(read.find((f) => f.path === "mine/preview.mp4")!.bytes.length).toBe(0);
    expect(checkImport(read).ok).toBe(true);
  });

  it("files the server stores that are far over a pack are still refused in words", async () => {
    // past four packs' worth (`filesOfInput`'s cut-off), in files the server would take one by one
    const list = [picked("mine/pack.json", 10), ...Array.from({ length: Math.ceil((PACK_CEILING_BYTES * 4) / 500_000) + 1 }, (_, k) => picked(`mine/assets/a${k}.png`, 500_000))];
    await expect(filesOfInput(list as unknown as FileList)).rejects.toThrow("far more than a pack holds");
  });
});

describe("a pack a later build's built-in shadows", () => {
  it("forgetting it leaves the built-in's card, layer and Look alone", () => {
    sampleCards["look-paper"] = { kind: "flat" } as never;
    lookLayers.paper = { accent: "#123456" };
    forgetUserPack("paper");
    expect(sampleCards["look-paper"]).toBeDefined();
    expect(lookLayers.paper).toBeDefined();
    expect(isLookId("paper")).toBe(true);
    delete sampleCards["look-paper"];
    delete lookLayers.paper;
  });
});

describe("a zip with files that are not part of a pack", () => {
  const big = (n: number) => new Uint8Array(n).fill(65);
  it("a big file the server would not store is left out, not a failure", async () => {
    const files = [...folder("mine").filter((f) => f.path === "pack.json" || f.path === "look.json"), { path: "preview.png", bytes: big(300_000) }, { path: "README.md", bytes: big(300_000) }];
    const read = await filesOfZip(stored(files));
    expect(read.map((f) => f.path).sort()).toEqual(["README.md", "look.json", "pack.json", "preview.png"]);
    expect(read.find((f) => f.path === "preview.png")!.bytes.length).toBe(0);
    const report = checkImport(read);
    expect(report.issues.filter((i) => i.rule === "not-stored").map((i) => i.file).sort()).toEqual(["README.md", "preview.png"]);
  });

  it("a file it would store that is over the cap is refused in words, not with a raw error", async () => {
    const files = [...folder("mine").filter((f) => f.path === "pack.json"), { path: "assets/hazard.svg", bytes: big(300_000) }];
    await expect(filesOfZip(stored(files))).rejects.toThrow(/assets\/hazard\.svg is too big for a pack/);
  });
});

/** A zip of stored (uncompressed) entries. */
function stored(files: PickedFile[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (n: number) => [n & 255, (n >> 8) & 255];
  const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  const crc = (data: Uint8Array) => {
    let c = ~0;
    for (const b of data) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  for (const f of files) {
    const name = enc(f.path);
    const head = Uint8Array.from([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc(f.bytes)), ...u32(f.bytes.length), ...u32(f.bytes.length), ...u16(name.length), ...u16(0), ...name]);
    central.push(Uint8Array.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc(f.bytes)), ...u32(f.bytes.length), ...u32(f.bytes.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name]));
    parts.push(head, f.bytes);
    offset += head.length + f.bytes.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(size), ...u32(offset), ...u16(0)]);
  return Uint8Array.from([...parts, ...central, end].flatMap((p) => [...p]));
}
