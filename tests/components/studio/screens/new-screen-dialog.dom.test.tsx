// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewScreenDialog } from "@/components/studio/screens/new-screen-dialog";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});

describe("the New screen gallery", () => {
  it("at a tall size a strip-only template is not in the size's section, and choosing it switches the size", () => {
    const onCreate = vi.fn();
    render(<NewScreenDialog open onOpenChange={vi.fn()} onCreate={onCreate} size={{ width: 480, height: 1920 }} />);
    const gallery = screen.getByRole("radiogroup", { name: "Start from" });
    expect(screen.getByRole("radio", { name: "480 × 1920" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Tall" }).getAttribute("aria-checked")).toBe("true");
    expect(within(gallery).getByRole("radio", { name: "General" })).toBeTruthy();
    expect(within(gallery).queryByRole("radio", { name: "Status bar" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    expect(within(screen.getByRole("region", { name: "Tall" })).queryByRole("radio", { name: "Status bar" })).toBeNull();
    fireEvent.click(within(screen.getByRole("region", { name: "Strip" })).getByRole("radio", { name: "Status bar" }));
    expect(screen.getByRole("radio", { name: "1280 × 160" }).getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    const [made] = onCreate.mock.calls[0];
    expect(made.profile).toMatchObject({ name: "Status bar", width: 1280, height: 160 });
    expect(made.profile.pages[0].placements.map((z: { module: string }) => z.module)).toEqual(["StatusBar"]);
  });
});
