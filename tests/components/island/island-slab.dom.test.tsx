// @vitest-environment happy-dom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DynamicIsland } from "@/components/island/dynamic-island";
import type { ActiveAlert } from "@/lib/alerts";
import { createIslandBus } from "@/lib/island/bus";
import { ISLAND_DEFAULTS } from "@/lib/island/config";

// look.json `layouts.island`: under a pack that names `slab` the island squares its pill, cuts a corner and opens a notice as the
// kit's tone slab; under any other Look it is the standard pill.
const alert: ActiveAlert = {
  id: "a",
  ruleId: "r",
  name: "Deck overheating",
  severity: "critical",
  text: "Core at 96 %",
  startedAt: 1000,
  acknowledged: false,
  display: { style: "island", position: "top", backdrop: "none", size: "m", seconds: 10 },
};

afterEach(cleanup);

const draw = (lookId: string) =>
  render(<DynamicIsland config={{ ...ISLAND_DEFAULTS, motion: "off" }} alerts={[alert]} placement="absolute" page={{ width: 1920, height: 1080 }} skin={{ lookId }} bus={createIslandBus()} />);

describe("the island layout", () => {
  it("is the tone slab under a pack that names it", async () => {
    draw("cyberspec");
    await waitFor(() => expect(document.querySelector(".island[data-layout=slab]")).not.toBeNull());
    const island = document.querySelector<HTMLElement>(".island")!;
    expect(island.style.borderRadius).toBe("0px");
    expect(island.querySelector("[data-severity=critical]")?.textContent).toContain("Deck overheating");
    expect(island.getAttribute("role")).toBe("alert");
  });

  it("stays the standard pill under a pack that names none", async () => {
    draw("paper");
    await new Promise((r) => setTimeout(r, 50));
    const island = document.querySelector<HTMLElement>(".island")!;
    expect(island.hasAttribute("data-layout")).toBe(false);
    expect(island.querySelector("[data-severity]")).toBeNull();
  });
});
