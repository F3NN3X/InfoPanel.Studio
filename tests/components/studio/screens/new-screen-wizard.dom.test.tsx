// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewScreenWizard } from "@/components/studio/screens/new-screen-wizard";
import { screenTemplateById } from "@/lib/screen-templates/catalog";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});

const wizard = (start: { width: number; height: number }, onCreate = vi.fn()) =>
  render(<NewScreenWizard start={start} onCreate={onCreate} onCancel={vi.fn()} onSample={vi.fn()} onInfoPanel={vi.fn()} onImport={vi.fn()} />);
const checked = (name: string) => screen.getByRole("radio", { name }).getAttribute("aria-checked");
const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const back = () => fireEvent.click(screen.getByRole("button", { name: "Back" }));
const card = (name: string) => fireEvent.click(within(screen.getByRole("radiogroup", { name: "Start from" })).getByRole("radio", { name }));

describe("the New screen page", () => {
  it("at a tall size a strip-only template is not in the size's section, and choosing it switches the size", () => {
    const onCreate = vi.fn();
    wizard({ width: 480, height: 1920 }, onCreate);
    const gallery = screen.getByRole("radiogroup", { name: "Start from" });
    expect(checked("Tall")).toBe("true");
    expect(within(gallery).getByRole("radio", { name: "General" })).toBeTruthy();
    expect(within(gallery).queryByRole("radio", { name: "Status bar" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    expect(within(screen.getByRole("region", { name: "Tall" })).queryByRole("radio", { name: "Status bar" })).toBeNull();
    fireEvent.click(within(screen.getByRole("region", { name: "Strip" })).getByRole("radio", { name: "Status bar" }));
    next();
    expect(checked("1280 × 160")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    const [made] = onCreate.mock.calls[0];
    expect(made.profile).toMatchObject({ name: "Status bar", width: 1280, height: 160 });
    expect(made.profile.pages[0].placements.map((z: { module: string }) => z.module)).toEqual(["StatusBar"]);
  });

  it("a template brings its own size, Blank its start size, until the size is changed here", () => {
    const onCreate = vi.fn();
    const own = screenTemplateById("meters")!.size!;
    wizard({ width: 1024, height: 600 }, onCreate);
    // Meters fits the start size's shape too, and still comes at its own size.
    card("Meters");
    next();
    expect(checked(`${own.width} × ${own.height}`)).toBe("true");
    back();
    card("Blank");
    next();
    expect(checked("1024 × 600")).toBe("true");

    // Changed here: a template picked after keeps it.
    fireEvent.click(screen.getByRole("radio", { name: "800 × 480" }));
    back();
    card("Meters");
    next();
    expect(checked("800 × 480")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onCreate.mock.calls[0][0].profile).toMatchObject({ name: "Meters", width: 800, height: 480 });
  });

  it("Escape and Cancel leave without making anything", () => {
    const onCreate = vi.fn();
    const onCancel = vi.fn();
    render(<NewScreenWizard start={{ width: 1024, height: 600 }} onCreate={onCreate} onCancel={onCancel} onSample={vi.fn()} onInfoPanel={vi.fn()} onImport={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole("heading", { name: "Start from" }), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
