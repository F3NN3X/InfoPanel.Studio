import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCREEN_TEMPLATES } from "@/lib/screen-templates/catalog";
import { REFERENCE } from "@/lib/screen-templates/kit";
import { instantiate } from "@/lib/screen-templates/instantiate";
import golden from "./instantiate-golden.json";

/**
 * Every template, palette and shape class makes the same screen it always did: the look now comes through the
 * built-in preset (`looks.ts`), and this pins the whole profile (ids aside) so a change of the look's path shows.
 * Regenerate the fixture only for a deliberate change of a template: `UPDATE_GOLDEN=1 npm test -- instantiate-golden`.
 */
const FIXTURE = new URL("./instantiate-golden.json", import.meta.url);
const hash = (v: unknown) => createHash("sha1").update(JSON.stringify(v, (k, x) => (k === "id" ? undefined : x))).digest("hex").slice(0, 16);

const made = Object.fromEntries(
  SCREEN_TEMPLATES.flatMap((t) =>
    (t.variants ?? [undefined]).flatMap((v) =>
      [...Object.values(REFERENCE), t.size].map((s) => {
        const { profile, unbound } = instantiate(t, { name: t.name, variant: v?.id, width: s.width, height: s.height });
        return [`${t.id}/${v?.id ?? "-"}/${s.width}x${s.height}`, hash({ profile, unbound })];
      }),
    ),
  ),
);

describe("instantiate, the whole catalog", () => {
  it.skipIf(!process.env.UPDATE_GOLDEN)("writes the fixture", () => {
    writeFileSync(FIXTURE, `${JSON.stringify(made, null, 1)}\n`);
  });

  it("makes the same screens as the fixture", () => {
    expect(existsSync(FIXTURE)).toBe(true);
    expect(made).toEqual(golden);
  });
});
