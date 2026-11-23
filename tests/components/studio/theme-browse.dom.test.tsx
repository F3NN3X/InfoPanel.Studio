// @vitest-environment happy-dom
// Browse themes loads each theme on its own: one that fails is named with Retry, the rest still list.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { ThemeBrowse } from "@/components/studio/theme-browse";
import type { PackImporterHandle } from "@/components/studio/user-packs";
import { CLASSIC } from "@/looks";

const loadLook = vi.fn();
vi.mock("@/looks", async (actual) => ({ ...(await actual<object>()), loadLook: (id: string) => loadLook(id) }));
// The thumbnails draw real widgets; the loading is what is tested here.
vi.mock("@/components/studio/look-thumb", () => ({ LookThumb: () => null }));

/** Browse with the props a test does not care about filled in. */
function mount(over: Partial<React.ComponentProps<typeof ThemeBrowse>> = {}) {
  return render(
    <ThemeBrowse
      levelName="Desk"
      currentLookId="classic"
      saved={[]}
      packs={[]}
      packsOff={false}
      importer={createRef<PackImporterHandle>()}
      onPacksChange={() => {}}
      keepBackground={false}
      onApply={() => {}}
      onPreview={() => {}}
      onCustomise={() => {}}
      onDuplicate={() => {}}
      onRename={() => {}}
      onDelete={() => {}}
      onRemovePack={() => 0}
      onTemplates={() => {}}
      templatesText=""
      {...over}
    />
  );
}

describe("ThemeBrowse", () => {
  it("names a theme whose chunk fails with Retry, and lists the others", async () => {
    let fail = true;
    loadLook.mockImplementation((id: string) => {
      if (id === "classic") return Promise.resolve(CLASSIC);
      if (id === "hud" && fail) return Promise.reject(new Error("chunk failed"));
      return id === "hud" ? Promise.resolve({ ...CLASSIC, id: "hud", name: "Hud" }) : Promise.resolve(undefined);
    });
    mount();
    await act(async () => {});
    expect(screen.getByRole("button", { name: /^Classic/ })).toBeTruthy();
    const retry = screen.getByRole("button", { name: "Retry HUD" });
    fail = false;
    fireEvent.click(retry);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Retry HUD" })).toBeNull();
    expect(screen.getByRole("button", { name: /^HUD/ })).toBeTruthy();
  });

  it("a pack a built-in now shadows has no card, says so, and offers Remove", async () => {
    loadLook.mockImplementation((id: string) => Promise.resolve(id === "classic" ? CLASSIC : undefined));
    mount({ packs: [{ id: "paper", name: "My Paper", size: 10, warnings: [] }] });
    await act(async () => {});
    expect(document.querySelector("[data-pack-shadowed]")?.textContent).toContain("a built-in theme now has this id");
    expect(screen.queryByRole("button", { name: /^My Paper/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove My Paper" })).toBeTruthy();
  });

  it("an imported pack's card and detail say its trust, a withdrawn one with the reason", async () => {
    loadLook.mockImplementation((id: string) => Promise.resolve(id === "classic" ? CLASSIC : undefined));
    vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
    mount({ packs: [{ id: "mine", name: "Mine", size: 10, warnings: [], trust: { state: "revoked", reason: "copies a logo" } }] });
    await act(async () => {});
    const card = screen.getByRole("button", { name: /^Mine, theme pack.*Withdrawn: copies a logo/ });
    expect(card.querySelector("[data-pack-trust]")?.getAttribute("data-pack-trust")).toBe("revoked");
    fireEvent.click(card);
    await act(async () => {});
    const note = document.querySelector("[data-pack-trust-note]");
    expect(note?.textContent).toContain("Withdrawn: copies a logo");
    expect(note?.textContent).toContain("not used");
    vi.unstubAllGlobals();
  });

  it("with packs off on the server shows no import, and says so", async () => {
    loadLook.mockImplementation((id: string) => Promise.resolve(id === "classic" ? CLASSIC : undefined));
    mount({ packsOff: true });
    await act(async () => {});
    expect(document.querySelector("[data-pack-folder]")).toBeNull();
    expect(document.querySelector("[data-packs-off]")).not.toBeNull();
  });
});
