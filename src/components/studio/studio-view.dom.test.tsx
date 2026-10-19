// @vitest-environment happy-dom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANVAS_ID, defaultConfig, type DashboardConfig } from "@/lib/layout";
import { profileWithPage } from "@/lib/pages";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import { StudioView } from "./studio-view";

// The import dialog and the pages are other tests' business: the io hook hands its `onLanded` out, the
// editor and the Library page are markers that show whether they are mounted and hidden.
const io = vi.hoisted(() => ({ onLanded: (_zoneId: string, _newProfile: boolean) => {} }));
vi.mock("./infopanel-io", () => ({
  useInfoPanelIo: (deps: { onLanded: typeof io.onLanded }) => {
    io.onLanded = deps.onLanded;
    return { openImport: () => {}, openExport: () => {}, canExport: false, dialogs: null };
  },
}));
vi.mock("@/components/infopanel/edit/canvas-editor", async () => {
  const { useState: state } = await import("react");
  return {
    default: ({ zone, hidden }: { zone: { id: string }; hidden?: boolean }) => {
      const [n, setN] = state(0);
      return (
        <div data-testid="editor" data-zone={zone.id} data-hidden={String(!!hidden)}>
          <button type="button" onClick={() => setN(n + 1)}>
            edits {n}
          </button>
        </div>
      );
    },
  };
});
vi.mock("@/components/library/library-page", () => ({ default: () => <div data-testid="library-page" /> }));

const canvas = { source: { name: "Arc" }, items: [], assets: [], fonts: [] } as unknown as StoredCanvas;
const zoneOf = (id: string) => ({ id, module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, canvas });

function Host() {
  const [config, setConfig] = useState<DashboardConfig>(defaultConfig);
  const stored = config.profiles.find((p) => p.id === config.activeProfile) ?? config.profiles[0];
  Object.assign(host, { addZone: () => setConfig((c) => ({ ...c, profiles: c.profiles.map((p) => (p === stored ? { ...p, pages: p.pages.map((pg, j) => (j ? pg : { ...pg, placements: [...pg.placements, zoneOf("z2")] })) } : p)) })) });
  return (
    <StudioView
      config={config}
      profile={profileWithPage(stored)}
      onPageChange={() => {}}
      setConfig={setConfig}
      windowWidth={1280}
      windowHeight={800}
      onExitStudio={() => {}}
      onSave={async () => true}
      pushPending={false}
      offline={false}
    />
  );
}
const host = { addZone: () => {} };

describe("the studio around the canvas editor", () => {
  beforeEach(() => void vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline")))));

  it("opens the editor on the zone an import just landed", async () => {
    render(<Host />);
    expect(screen.queryByTestId("editor")).toBeNull();
    act(() => host.addZone());
    act(() => io.onLanded("z2", false));
    expect((await screen.findByTestId("editor")).getAttribute("data-zone")).toBe("z2");
  });

  it("keeps the editor mounted but hidden while the Library shows, and brings it back", async () => {
    const user = userEvent.setup();
    render(<Host />);
    act(() => host.addZone());
    act(() => io.onLanded("z2", false));
    await user.click(await screen.findByRole("button", { name: "edits 0" }));
    expect(screen.getByRole("button", { name: "edits 1" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Library" }));
    expect(await screen.findByTestId("library-page")).toBeTruthy();
    const hidden = document.querySelector('[data-testid="editor"]')!;
    expect(hidden.getAttribute("data-hidden")).toBe("true");
    expect(hidden.parentElement!.hasAttribute("inert")).toBe(true);
    expect(hidden.parentElement!.hasAttribute("hidden")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Library" }));
    expect(screen.queryByTestId("library-page")).toBeNull();
    const back = screen.getByTestId("editor");
    expect(back.getAttribute("data-hidden")).toBe("false");
    expect(back.parentElement!.hasAttribute("inert")).toBe(false);
    // The same instance: its state survived the visit.
    expect(screen.getByRole("button", { name: "edits 1" })).toBeTruthy();
  });
});
