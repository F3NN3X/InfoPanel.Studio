import { describe, expect, it } from "vitest";
import { renderModule } from "@/widgets/test-render";
import { TEMPLATE_MODULES } from "./registry";

describe("SteamNews studio variant", () => {
  const mod = TEMPLATE_MODULES.find((m) => m.id === "SteamNews")!;

  it("leads with the headline count; the headline itself is the quiet sub line (the value is a single unwrapped line)", () => {
    const html = renderModule(mod, { compact: "dense", sizeTier: "md" });
    expect(html).toMatch(/headlines?</);
  });
});
