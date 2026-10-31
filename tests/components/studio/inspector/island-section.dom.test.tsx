// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openSettings: vi.fn(async () => {}) }));
vi.mock("@/lib/desktop", async (original) => ({ ...(await original<typeof import("@/lib/desktop")>()), openSettings: mocks.openSettings }));

import { IslandSection } from "@/components/studio/inspector/island-section";
import { ISLAND_DEFAULTS } from "@/lib/island/config";

afterEach(cleanup);

describe("IslandSection, connections note", () => {
  it("points to Settings › Connections and opens it", () => {
    const island = { ...ISLAND_DEFAULTS, enabled: true, notices: { ...ISLAND_DEFAULTS.notices, onAir: true } };
    render(
      <IslandSection
        island={island}
        previewBus={{ notify: vi.fn() } as never}
        onChange={vi.fn()}
        onLook={vi.fn()}
        onOpenExplorer={vi.fn()}
        links={{ font: null, clock: null }}
        lead={null}
        aside={null}
      />
    );
    expect(screen.getByText(/Connections are in Settings › Connections/)).toBeTruthy();
    fireEvent.click(screen.getByText("Open"));
    expect(mocks.openSettings).toHaveBeenCalledWith("connections");
  });
});
