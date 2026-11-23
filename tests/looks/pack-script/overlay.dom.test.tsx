// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pack } from "@/looks/pack";
import { PackScript } from "@/looks/pack-script/mount";
import PackScriptOverlay, { paletteOf } from "@/looks/pack-script/overlay";
import type { PackTrust } from "@/looks/pack-script/trust";

// a built-in pack's script loads from the bundle: the real loader, watched
const bundled = vi.hoisted(() => ({ calls: [] as string[][] }));
vi.mock("@/looks/pack-script/builtin", async (actual) => {
  const real = await actual<typeof import("@/looks/pack-script/builtin")>();
  return { builtinScript: (id: string, file: string) => (bundled.calls.push([id, file]), real.builtinScript(id, file)) };
});

// The consent states in the studio and the kiosk, against a fake of the trust routes. happy-dom has no OffscreenCanvas, so no
// script starts here (the browser spec runs one): these check who is asked, what is stored, and that nothing runs without the server's word.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  bundled.calls.length = 0;
});

const PACK = { id: "neon-fx", look: { name: "Neon FX", modes: { supported: ["dark"] } }, script: { file: "fx.js" } } as unknown as Pack;

/** A fake server: the trust it answers, and every request it saw. */
function server(trust: PackTrust, on = true, env = on) {
  const seen: { url: string; method: string; body?: string }[] = [];
  let now = trust;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      seen.push({ url, method: init.method ?? "GET", body: init.body as string | undefined });
      if (url === "/api/pack-scripts") return Response.json({ on, env, fetching: false, stale: false });
      if (url.endsWith("/script-consent")) {
        const granted = JSON.parse(init.body as string).granted as boolean;
        now = { ...now, consent: granted ? "granted" : "denied", scriptRuns: granted, ...(granted ? { scriptSha256: SHA } : null) };
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/trust")) return Response.json(now);
      if (url.includes("/fx.js?sha256=")) return new Response("fx.onFrame(function(){})", { headers: { "Content-Type": "text/javascript" } });
      return new Response(null, { status: 404 });
    }),
  );
  return seen;
}
const SHA = "0".repeat(64);
const UNVERIFIED: PackTrust = { state: "unverified", hasScript: true, consent: "none", scriptRuns: false };
const status = () => document.querySelector("[data-pack-script]")?.getAttribute("data-pack-script");

describe("the pack-script overlay", () => {
  it("asks in the studio for an unverified pack's script; Allow stores it and the script is fetched", async () => {
    const seen = server(UNVERIFIED);
    render(<PackScriptOverlay pack={PACK} studio />);
    const dialog = await screen.findByTestId("script-consent");
    expect(dialog.textContent).toContain("not been reviewed by Themely");
    expect(dialog.textContent).toContain("Reach the network");
    await userEvent.click(screen.getByRole("button", { name: "Allow for this pack" }));
    await waitFor(() => expect(seen.some((r) => r.url === `/api/packs/neon-fx/fx.js?sha256=${SHA}`)).toBe(true));
    expect(seen.find((r) => r.method === "PUT")).toEqual({ url: "/api/packs/neon-fx/script-consent", method: "PUT", body: '{"granted":true}' });
    expect(screen.queryByTestId("script-consent")).toBeNull();
    // no OffscreenCanvas here: the sandbox is not supported, so nothing runs
    expect(status()).toBe("waiting");
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("stores Don't allow and never fetches the script; dismissing stores nothing", async () => {
    const seen = server(UNVERIFIED);
    render(<PackScriptOverlay pack={PACK} studio />);
    await userEvent.click(await screen.findByRole("button", { name: "Don't allow" }));
    await waitFor(() => expect(seen.filter((r) => r.url.endsWith("/trust")).length).toBe(2));
    expect(seen.find((r) => r.method === "PUT")?.body).toBe('{"granted":false}');
    expect(seen.some((r) => r.url.includes("/fx.js"))).toBe(false);
    cleanup();

    const again = server(UNVERIFIED);
    render(<PackScriptOverlay pack={PACK} studio />);
    await screen.findByTestId("script-consent");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("script-consent")).toBeNull());
    expect(again.some((r) => r.method === "PUT")).toBe(false);
  });

  it.each([
    ["the kiosk, for the same pack", UNVERIFIED, false],
    ["an answered pack", { ...UNVERIFIED, consent: "denied", scriptRuns: false }, true],
    ["a verified pack", { state: "verified", hasScript: true, consent: "none", scriptRuns: true, scriptSha256: SHA }, true],
    ["a modified pack", { state: "modified", hasScript: true, consent: "none", scriptRuns: false }, true],
  ] as const)("never asks in %s", async (_, trust, studio) => {
    const seen = server(trust as PackTrust);
    render(<PackScriptOverlay pack={PACK} studio={studio} />);
    await waitFor(() => expect(seen.some((r) => r.url.endsWith("/trust"))).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("script-consent")).toBeNull();
    expect(seen.some((r) => r.url.includes("/fx.js"))).toBe(trust.scriptRuns);
  });

  it("neither asks nor fetches while the server's switch is off, and asks the server only its switch for a built-in pack", async () => {
    const off = server(UNVERIFIED, false);
    render(<PackScriptOverlay pack={PACK} studio />);
    await waitFor(() => expect(off.some((r) => r.url.endsWith("/trust"))).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("script-consent")).toBeNull();
    expect(off.some((r) => r.url.includes("/fx.js"))).toBe(false);
    cleanup();
    const builtin = server({ ...UNVERIFIED, state: "verified", scriptRuns: true, scriptSha256: SHA });
    render(<PackScriptOverlay pack={{ ...PACK, id: "cyberspec" }} studio />);
    await new Promise((r) => setTimeout(r, 20));
    expect(builtin.map((r) => r.url)).toEqual(["/api/pack-scripts"]);
    expect(status()).toBe("waiting");
  });

  it("loads a built-in pack's script from the bundle while the switch is on, asking nobody, and not under PACK_SCRIPTS=off", async () => {
    const CYBERSPEC = { ...PACK, id: "cyberspec" } as Pack;
    server(UNVERIFIED);
    render(<PackScriptOverlay pack={CYBERSPEC} studio />);
    await waitFor(() => expect(bundled.calls).toEqual([["cyberspec", "fx.js"]]));
    expect(screen.queryByTestId("script-consent")).toBeNull();
    cleanup();
    bundled.calls.length = 0;

    for (const [on, env] of [[false, false], [true, false]]) {
      const seen = server(UNVERIFIED, on, env);
      render(<PackScriptOverlay pack={CYBERSPEC} />);
      await waitFor(() => expect(seen.length).toBe(1));
      await new Promise((r) => setTimeout(r, 20));
      expect(bundled.calls).toEqual([]);
      cleanup();
    }
  });

  it("paints with the screen's accent at index 0 when it sets one, and the Look's own colours otherwise", async () => {
    const pack = (await import("@/looks/pack-load")).loadPack;
    const cyberspec = (await pack("cyberspec"))!;
    const own = paletteOf(cyberspec);
    expect(own).toHaveLength(10);
    expect(paletteOf(cyberspec, "#2bf59a")).toEqual(["#2bf59a", ...own.slice(1)]);
  });

  it("is nothing for a pack without a script: no request, no element", () => {
    const seen = server(UNVERIFIED);
    const { container } = render(<PackScript pack={{ ...PACK, script: undefined }} />);
    expect(container.innerHTML).toBe("");
    expect(seen).toEqual([]);
  });
});
