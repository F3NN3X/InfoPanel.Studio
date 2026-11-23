import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { expect, makePack, manifest, settled, test } from "./fixtures";

// User pack CSS (L94): the whole road, on a release build with debug off. A pack with a stylesheet is read by the grammar, worn in the
// render check's hidden frame, stored, signed and drawn by a kiosk from the route; CSS that hides text passes the grammar and is refused by
// the check, and nothing is stored; a file edited afterwards or CSS put straight into the folder is not served; the check's page opens for its frame alone.

const { light } = manifest.profiles;
/** Field Kit's card colour: the same as `color` hides the text, and the grammar cannot know that. */
const CARD = "#EFE8D8";
const GOOD = '[data-part="header"] { --pack-ink: #6b1d00; color: var(--pack-ink); }\n[data-part="num"] { text-shadow: 0 1px 2px #0000002e; }\n';

/** A 4x4 RGBA png of one alpha, so a mask's alpha over the text is known exactly. */
function maskPng(alpha: number): Buffer {
  const [n, crcs] = [4, new Int32Array(256).map((_, i) => { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; })];
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    let c = -1;
    for (const b of body) c = crcs[(c ^ b) & 0xff] ^ (c >>> 8);
    const [len, crc] = [Buffer.alloc(4), Buffer.alloc(4)];
    len.writeUInt32BE(data.length);
    crc.writeUInt32BE((c ^ -1) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(n, 0);
  head.writeUInt32BE(n, 4);
  head.set([8, 6, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: n }, () => [0, 0, 0, alpha]).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", head), chunk("IDAT", zlib.deflateSync(Buffer.concat(Array.from({ length: n }, () => row)))), chunk("IEND", Buffer.alloc(0))]);
}
const maskPack = (tmp: string, id: string, alpha: number) =>
  makePack(tmp, id, (dir) => {
    fs.writeFileSync(path.join(dir, "assets", "mask.png"), maskPng(alpha));
    fs.writeFileSync(path.join(dir, "pack.css"), '[data-part="card"] { mask-image: url("assets/mask.png"); mask-size: 100% 100%; mask-repeat: no-repeat; }\n');
  });

const packsOf = async (base: string) => (await (await fetch(`${base}/api/packs`)).json()) as { id: string }[];

async function openPacks(page: import("@playwright/test").Page, base: string) {
  await page.goto(`${base}/?studio=1&profile=${light}`);
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("tab", { name: /Browse themes/ }).click();
  const section = page.getByRole("region", { name: "Import a pack" });
  await expect(section).toBeAttached();
  return section;
}

test.describe("a pack with its own stylesheet", () => {
  test.setTimeout(240_000);
  let tmp: string;
  test.beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ips-user-css-"));
  });
  test.afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test("is checked, signed, drawn from the route, and stops being served when a stored file changes", async ({ page, scratch }) => {
    const section = await openPacks(page, scratch.base);
    await section.locator("[data-pack-folder]").setInputFiles(makePack(tmp, "mine", (dir) => fs.writeFileSync(path.join(dir, "pack.css"), GOOD)));
    await expect(section.locator("[data-pack-report]")).toContainText("Imported Mine", { timeout: 120_000 });
    await expect(page.locator("iframe")).toHaveCount(0);

    // the file is served with its signature's word and the headers L95 asks of a pack file; the key is beside the packs, never in one
    const css = await fetch(`${scratch.base}/api/packs/mine/pack.css`);
    expect(await css.text()).toBe(GOOD);
    expect(css.headers.get("x-pack-signature")).toBe("valid");
    expect(css.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(css.headers.get("x-content-type-options")).toBe("nosniff");
    expect(css.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    const root = path.join(scratch.dataDir, "packs", "mine");
    expect(fs.existsSync(path.join(root, "pack.sig"))).toBe(true);
    expect(fs.statSync(path.join(scratch.dataDir, "pack-signing.key")).size).toBe(32);

    await page.locator('[data-look-card="mine"]').click();
    await page.getByRole("complementary", { name: "Theme detail" }).getByRole("button", { name: /^Apply to/ }).click();
    await expect.poll(async () => {
      const config = await (await fetch(`${scratch.base}/api/config`)).json();
      return config.profiles.find((p: { id: string }) => p.id === light)?.widgetTheme?.values?.lookId;
    }).toBe("mine");
    const kiosk = await page.context().newPage();
    await kiosk.setViewportSize({ width: 1280, height: 720 });
    await kiosk.goto(`${scratch.base}/?kiosk=1&profile=${light}`);
    await expect(kiosk.locator('[data-wp-tier][data-look="mine"]').first()).toBeAttached({ timeout: 15_000 });
    await settled(kiosk, manifest.kioskZoneSelector);
    await expect(kiosk.locator('style[data-pack="mine"]')).toHaveCount(1);
    expect(await kiosk.locator('style[data-pack="mine"]').textContent()).toContain("--pack-ink");
    expect(await kiosk.locator('[data-wp-tier][data-look="mine"] [data-part="header"]').first().evaluate((el) => getComputedStyle(el).color)).toBe("rgb(107, 29, 0)");

    // one byte of any stored file, and the pack is no pack: the list, the file and a kiosk all refuse it
    fs.appendFileSync(path.join(root, "look.json"), " ");
    expect(await packsOf(scratch.base)).toEqual([]);
    expect((await fetch(`${scratch.base}/api/packs/mine/pack.css`)).status).toBe(404);
    await kiosk.reload();
    await expect(kiosk.locator(manifest.kioskZoneSelector).first()).toBeAttached({ timeout: 15_000 });
    await settled(kiosk, manifest.kioskZoneSelector);
    await expect(kiosk.locator('[data-look="mine"]')).toHaveCount(0);
    await expect(kiosk.locator('style[data-pack="mine"]')).toHaveCount(0);
  });

  test("that hides text passes the grammar, is refused by the render check, and nothing is stored", async ({ page, scratch }) => {
    const section = await openPacks(page, scratch.base);
    // the check's frame reads and draws: it writes nothing of the config or the packs
    const writes: string[] = [];
    page.on("request", (r) => r.method() !== "GET" && r.method() !== "HEAD" && writes.push(`${r.method()} ${r.url()}`));
    await section.locator("[data-pack-folder]").setInputFiles(makePack(tmp, "hider", (dir) => fs.writeFileSync(path.join(dir, "pack.css"), `[data-part="num"] { color: ${CARD}; }\n`)));
    const report = section.locator("[data-pack-report]");
    await expect(report).toContainText("can't be imported", { timeout: 120_000 });
    await expect(report).toContainText("The render check refused this pack");
    await expect(report).toContainText("under 3:1");
    expect(writes).toEqual([]);
    expect(await packsOf(scratch.base)).toEqual([]);
    expect(fs.existsSync(path.join(scratch.dataDir, "packs", "hider"))).toBe(false);
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  test("that paints the sparks and icons into the card is refused the same way", async ({ page, scratch }) => {
    const section = await openPacks(page, scratch.base);
    await section.locator("[data-pack-folder]").setInputFiles(makePack(tmp, "blank", (dir) => fs.writeFileSync(path.join(dir, "pack.css"), `[data-part="spark"], [data-part="icon"] { color: ${CARD}; stroke: ${CARD}; fill: ${CARD}; }\n`)));
    const report = section.locator("[data-pack-report]");
    await expect(report).toContainText("The render check refused this pack", { timeout: 120_000 });
    await expect(report).toContainText("not seen on what is behind");
    expect(await packsOf(scratch.base)).toEqual([]);
  });

  test("that fades content down the tree is refused the same way", async ({ page, scratch }) => {
    const section = await openPacks(page, scratch.base);
    await section.locator("[data-pack-folder]").setInputFiles(makePack(tmp, "fader", (dir) => fs.writeFileSync(path.join(dir, "pack.css"), '[data-part="card"] { opacity: 0.5; }\n[data-part="header"], [data-part="label"], [data-part="num"], [data-part="unit"] { opacity: 0.5; }\n')));
    const report = section.locator("[data-pack-report]");
    await expect(report).toContainText("The render check refused this pack", { timeout: 120_000 });
    expect(await packsOf(scratch.base)).toEqual([]);
  });

  test("whose png mask is mostly transparent over the text is refused, and nothing is stored", async ({ page, scratch }) => {
    const section = await openPacks(page, scratch.base);
    await section.locator("[data-pack-folder]").setInputFiles(maskPack(tmp, "veil", 20));
    const report = section.locator("[data-pack-report]");
    await expect(report).toContainText("The render check refused this pack", { timeout: 120_000 });
    await expect(report).toContainText("under a mask that leaves less than");
    expect(await packsOf(scratch.base)).toEqual([]);
    expect(fs.existsSync(path.join(scratch.dataDir, "packs", "veil"))).toBe(false);
  });

  test("whose png mask is opaque over the text is imported and listed", async ({ page, scratch }) => {
    const section = await openPacks(page, scratch.base);
    await section.locator("[data-pack-folder]").setInputFiles(maskPack(tmp, "solid", 255));
    await expect(section.locator("[data-pack-report]")).toContainText("Imported Mine", { timeout: 120_000 });
    expect((await packsOf(scratch.base)).map((p) => p.id)).toEqual(["solid"]);
  });
});

test("CSS put straight into the folder is not a pack, and a pack beside it is untouched", async ({ scratch }) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ips-user-css-"));
  try {
    const packs = path.join(scratch.dataDir, "packs");
    fs.mkdirSync(packs, { recursive: true });
    fs.cpSync(makePack(tmp, "plain"), path.join(packs, "plain"), { recursive: true });
    fs.cpSync(makePack(tmp, "dropped", (dir) => fs.writeFileSync(path.join(dir, "pack.css"), GOOD)), path.join(packs, "dropped"), { recursive: true });
    fs.writeFileSync(path.join(packs, "dropped", "pack.sig"), Buffer.alloc(32, 7));
    expect((await packsOf(scratch.base)).map((p) => p.id)).toEqual(["plain"]);
    expect((await fetch(`${scratch.base}/api/packs/dropped/pack.css`)).status).toBe(404);
    expect((await fetch(`${scratch.base}/api/packs/dropped/pack.json`)).status).toBe(413);
    expect((await fetch(`${scratch.base}/api/packs/plain/pack.css`)).status).toBe(404);
    expect((await fetch(`${scratch.base}/api/packs/plain/pack.json`)).status).toBe(200);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("the render check's page opens for its frame alone: a page that asks for it gets what Widget QA gives with debug off", async ({ page, scratch }) => {
  for (const url of ["/?widget-qa&pack-check=1", "/?widget-qa", "/widget-qa?pack-check=1"]) {
    const res = await page.goto(`${scratch.base}${url}`);
    expect(res?.status(), url).toBe(404);
    await expect(page.locator("body")).toContainText("Turn on debug mode");
    expect(await page.evaluate(() => typeof window.__qaMountAll)).toBe("undefined");
  }
});
