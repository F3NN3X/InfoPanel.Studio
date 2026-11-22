// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PackStage, usePack } from "@/looks/pack";
import { mountPackCss, registerPack, registerUserPack, unregisterPack, unregisterUserPack } from "@/looks/pack-load";
import type { Pack } from "@/looks/pack";
import { badPack, TEST_PACK } from "./__fixtures__/test-pack";

function Page({ lookId }: { lookId?: string }) {
  const pack = usePack(lookId);
  return (
    <main data-testid="page" data-pack={pack?.id ?? ""}>
      <PackStage pack={pack} className="fixed inset-0 -z-10" overlayClassName="fixed inset-0 z-10" />
    </main>
  );
}

afterEach(() => {
  cleanup();
  for (const id of ["test-pack", "bad-pack", "pack-b"]) unregisterPack(id);
});

function Probe({ lookId, seen }: { lookId: string; seen: [string, boolean][] }) {
  const pack = usePack(lookId);
  if (pack) seen.push([pack.id, !!document.head.querySelector(`style[data-pack="${pack.id}"]`)]);
  return <i data-testid="probe" data-pack={pack?.id ?? ""} />;
}

describe("usePack and PackStage", () => {
  it("loads a registered pack, mounts its stage and CSS, and takes the CSS out again", async () => {
    registerPack("test-pack", async () => ({ default: TEST_PACK }));
    const { unmount } = render(<Page lookId="test-pack" />);
    await waitFor(() => expect(screen.getByTestId("page").dataset.pack).toBe("test-pack"));
    await waitFor(() => expect(document.querySelectorAll("[data-pack-layer]").length).toBe(4));
    expect(document.head.querySelector('style[data-pack="test-pack"]')).not.toBeNull();
    unmount();
    expect(document.head.querySelector('style[data-pack="test-pack"]')).toBeNull();
  });

  it("loads a pack registered after the page first asked for its Look (a user pack read after a cached config drew)", async () => {
    render(<Page lookId="test-pack" />);
    expect(screen.getByTestId("page").dataset.pack).toBe("");
    registerPack("test-pack", async () => ({ default: TEST_PACK }));
    await waitFor(() => expect(screen.getByTestId("page").dataset.pack).toBe("test-pack"));
    await waitFor(() => expect(document.querySelectorAll("[data-pack-layer]").length).toBe(4));
  });

  it("shows nothing for Classic, an unregistered id, or a pack the loader refused", async () => {
    registerPack("bad-pack", async () => ({ default: badPack({ id: "bad-pack", css: '@import "x.css";' }) }));
    for (const lookId of [undefined, "classic", "unknown", "bad-pack"]) {
      render(<Page lookId={lookId} />);
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.getByTestId("page").dataset.pack).toBe("");
      expect(document.querySelector("[data-pack-layer]")).toBeNull();
      cleanup();
    }
    expect(document.head.querySelector("style[data-pack]")).toBeNull();
  });

  it("mounts the pack CSS scoped to its Look in @layer look, and its layers wear data-look", async () => {
    registerPack("test-pack", async () => ({ default: TEST_PACK }));
    render(<Page lookId="test-pack" />);
    await waitFor(() => expect(document.querySelectorAll('[data-pack-layer][data-look="test-pack"]').length).toBe(4));
    const css = document.head.querySelector('style[data-pack="test-pack"]')?.textContent ?? "";
    expect(css.startsWith('@layer look{@scope ([data-look="test-pack"]){')).toBe(true);
  });

  it("shares one load and one style element between consumers, and takes the style out with the last", async () => {
    let imports = 0;
    registerPack("test-pack", async () => {
      imports++;
      return { default: TEST_PACK };
    });
    const a = render(<Page lookId="test-pack" />);
    const b = render(<Page lookId="test-pack" />);
    await waitFor(() => expect(screen.getAllByTestId("page").every((el) => el.dataset.pack === "test-pack")).toBe(true));
    expect(imports).toBe(1);
    expect(document.head.querySelectorAll('style[data-pack="test-pack"]')).toHaveLength(1);
    a.unmount();
    expect(document.head.querySelectorAll('style[data-pack="test-pack"]')).toHaveLength(1);
    b.unmount();
    expect(document.head.querySelector('style[data-pack="test-pack"]')).toBeNull();
  });

  it("never returns a pack without its CSS when the Look goes A, B, A before B has loaded, and ignores B's late result", async () => {
    let releaseB = (_: Pack) => {};
    registerPack("test-pack", async () => ({ default: TEST_PACK }));
    registerPack("pack-b", () => new Promise((resolve) => (releaseB = (pack) => resolve({ default: pack }))));
    const seen: [string, boolean][] = [];
    const { rerender } = render(<Probe lookId="test-pack" seen={seen} />);
    await waitFor(() => expect(screen.getByTestId("probe").dataset.pack).toBe("test-pack"));
    rerender(<Probe lookId="pack-b" seen={seen} />);
    rerender(<Probe lookId="test-pack" seen={seen} />);
    await waitFor(() => expect(screen.getByTestId("probe").dataset.pack).toBe("test-pack"));
    releaseB(badPack({ id: "pack-b", look: { ...TEST_PACK.look, id: "pack-b" } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("probe").dataset.pack).toBe("test-pack");
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(([, css]) => css)).toBe(true);
    expect(document.head.querySelectorAll("style[data-pack]")).toHaveLength(1);
  });

  it("flags the root while any pack is worn, with or without CSS, and clears it with the last", () => {
    const root = document.documentElement;
    const plain = mountPackCss(badPack({ id: "no-css", css: undefined }));
    const styled = mountPackCss(badPack({ id: "with-css", css: "[data-x]{color:red}" }));
    expect(root.hasAttribute("data-pack-worn")).toBe(true);
    plain();
    plain();
    expect(root.hasAttribute("data-pack-worn")).toBe(true);
    styled();
    expect(root.hasAttribute("data-pack-worn")).toBe(false);
  });

  it("serves a user pack's CSS URLs from its route and a built-in pack's as written, whatever the pack says it is", () => {
    const css = '[data-part="card"]::after{content:"";mask-image:url(assets/m.svg)}';
    registerUserPack("mine-u", async () => ({ default: badPack({ id: "mine-u", css }) }));
    const offUser = mountPackCss(badPack({ id: "mine-u", css }));
    const offBuiltin = mountPackCss(badPack({ id: "built-u", css }));
    const sheet = (id: string) => document.head.querySelector(`style[data-pack="${id}"]`)?.textContent ?? "";
    expect(sheet("mine-u")).toContain("mask-image:url(/api/packs/mine-u/assets/m.svg);position:absolute;pointer-events:none;z-index:0;");
    expect(sheet("built-u")).toContain("mask-image:url(assets/m.svg);position:absolute;");
    offUser();
    offBuiltin();
    unregisterUserPack("mine-u");
  });
});
