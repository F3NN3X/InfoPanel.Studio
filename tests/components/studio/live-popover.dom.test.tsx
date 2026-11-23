// @vitest-environment happy-dom
// The live popover's page choice: one segment per page up to seven, a dropdown from eight.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveControl, PAGE_SEGMENTS_MAX } from "@/components/studio/live-popover";
import { liveActions } from "@/components/studio/live-model";
import type { MonitorProfile } from "@/lib/layout";

afterEach(cleanup);

const screenOf = (pages: number) =>
  ({ id: "s", name: "Desk", pages: Array.from({ length: pages }, (_, i) => ({ id: `p${i + 1}`, name: `Page ${i + 1}` })) }) as unknown as MonitorProfile;

const renderLive = (pages: number) =>
  render(<LiveControl open onOpenChange={() => {}} profiles={[]} screen={screenOf(pages)} control={null} kiosks={[]} onOpenKioskView={() => {}} />);

describe("the live popover's page choice", () => {
  it("keeps one segment per page at 7 pages", async () => {
    renderLive(PAGE_SEGMENTS_MAX);
    expect(await screen.findAllByRole("radio")).toHaveLength(PAGE_SEGMENTS_MAX);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("switches to a dropdown at 8 pages, and picking a row shows that page", async () => {
    const show = vi.spyOn(liveActions, "showPage").mockResolvedValue(undefined as never);
    renderLive(PAGE_SEGMENTS_MAX + 1);
    const box = await screen.findByRole("combobox", { name: "Show on Desk kiosks" });
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    await act(async () => {
      fireEvent.click(box);
    });
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(8);
    await act(async () => {
      fireEvent.pointerDown(options[7]);
      fireEvent.click(options[7]);
    });
    expect(show).toHaveBeenCalledWith("s", "p8");
    show.mockRestore();
  });
});
