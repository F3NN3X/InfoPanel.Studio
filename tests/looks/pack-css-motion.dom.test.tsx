// @vitest-environment happy-dom
// A pack's own CSS animations follow the screen's Effects level (gap item 8): the mount reads every animation name through
// `--wp-pack-motion` (pack-css.test.ts), and the page root sets it to `none` at Calm and Off, in lite mode and with reduced motion.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GeneralProvider } from "@/hooks/use-general";
import { PerformanceProvider } from "@/hooks/use-performance";
import { GENERAL_DEFAULTS, type ResolvedGeneral } from "@/lib/general";
import { PACK_MOTION_VAR } from "@/looks/pack-css";

const general = (over: Partial<ResolvedGeneral>): ResolvedGeneral => ({ ...GENERAL_DEFAULTS, motion: "full", ...over });
const mount = (g: ResolvedGeneral) =>
  render(
    <GeneralProvider value={g}>
      <PerformanceProvider value={undefined}>
        <i />
      </PerformanceProvider>
    </GeneralProvider>
  );
const rootVar = () => document.documentElement.style.getPropertyValue(PACK_MOTION_VAR);

afterEach(cleanup);

describe("pack CSS animation and the Effects level", () => {
  it("leaves the variable unset at Full, so every pack animation runs by its own name", () => {
    mount(general({ fx: "full" }));
    expect(rootVar()).toBe("");
  });

  it.each([
    ["Calm", { fx: "calm" as const }],
    ["Off", { fx: "off" as const }],
    ["reduced motion", { motion: "reduce" as const }],
    ["lite mode (under 60 fps)", { fx: "full" as const, maxFps: 30 }],
  ])("sets it to none at %s, and lets go of it on unmount", (_, over) => {
    const view = mount(general(over));
    expect(rootVar()).toBe("none");
    view.unmount();
    expect(rootVar()).toBe("");
  });
});
