// @vitest-environment happy-dom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AlertLayer } from "@/components/alerts/alert-layer";
import type { ActiveAlert } from "@/lib/alerts";

// L25: the alert cards wear the screen's pack colours through the layer's vars (index.css draws them); Classic's layer has none.
const alert: ActiveAlert = {
  id: "a",
  ruleId: "r",
  name: "Alert a",
  severity: "warning",
  text: "body",
  startedAt: 1000,
  acknowledged: false,
  display: { style: "toast", position: "top-right", backdrop: "none", size: "m", seconds: 10 },
};

afterEach(cleanup);

describe("the alert layer's chrome", () => {
  it("carries the worn pack's surface, text and edge once the pack has loaded", async () => {
    render(<AlertLayer alerts={[alert]} onAck={() => {}} lookId="paper" />);
    const layer = document.querySelector<HTMLElement>("[data-alert-layer]")!;
    expect(layer.hasAttribute("data-pack-chrome")).toBe(false);
    await waitFor(() => expect(layer.hasAttribute("data-pack-chrome")).toBe(true));
    for (const name of ["--pack-chrome-fill", "--pack-chrome-ink", "--pack-chrome-edge"]) expect(layer.style.getPropertyValue(name)).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("carries nothing for Classic or a Look that is not a pack", async () => {
    for (const lookId of [undefined, "classic", "nope"]) {
      render(<AlertLayer alerts={[alert]} onAck={() => {}} lookId={lookId} />);
      await new Promise((r) => setTimeout(r, 20));
      const layer = document.querySelector<HTMLElement>("[data-alert-layer]")!;
      expect(layer.hasAttribute("data-pack-chrome")).toBe(false);
      expect(layer.style.getPropertyValue("--pack-chrome-fill")).toBe("");
      cleanup();
    }
  });
});

// look.json `layouts.alert`: a pack that names `slab` draws the kit's tone slab cards; every other pack keeps the standard card.
describe("the alert layout", () => {
  it("is the tone slab under a pack that names it, in the Look's tone for the severity", async () => {
    render(<AlertLayer alerts={[alert, { ...alert, id: "b", severity: "critical", display: { ...alert.display, position: "bottom-left" } }]} onAck={() => {}} lookId="cyberspec" />);
    await waitFor(() => expect(document.querySelector("[data-part=alert][data-layout=slab]")).not.toBeNull());
    const cards = [...document.querySelectorAll<HTMLElement>("[data-part=alert]")];
    expect(cards.map((c) => c.dataset.severity).sort()).toEqual(["critical", "warning"]);
    const warning = cards.find((c) => c.dataset.severity === "warning")!;
    expect(warning.textContent).toContain("// Caution");
    // the live region and the keyboard path stay the standard card's
    expect(warning.querySelector("[role=alert]")).not.toBeNull();
    expect(warning.querySelector("button.alert-dismiss")).not.toBeNull();
  });

  it("stays the standard card under a pack that names none", async () => {
    render(<AlertLayer alerts={[alert]} onAck={() => {}} lookId="paper" />);
    await waitFor(() => expect(document.querySelector("[data-alert-layer]")!.hasAttribute("data-pack-chrome")).toBe(true));
    expect(document.querySelector("[data-part=alert]")!.hasAttribute("data-layout")).toBe(false);
  });
});
