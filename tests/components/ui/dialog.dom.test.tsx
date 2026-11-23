// @vitest-environment happy-dom
// ui/dialog: the one modal look, a caller's class winning where it overlaps, and the close paths each kind keeps.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AlertDialogParts, DialogParts } from "@/components/ui/dialog";

describe("DialogParts", () => {
  it("names the popup by its title and describes it, with the caller's width over the shared one", async () => {
    render(
      <DialogParts.Root open>
        <DialogParts.Content className="w-[min(36rem,calc(100vw-2rem))]">
          <DialogParts.Title>Rename screen</DialogParts.Title>
          <DialogParts.Description>Shown in the sidebar.</DialogParts.Description>
        </DialogParts.Content>
      </DialogParts.Root>
    );
    const dialog = await screen.findByRole("dialog", { name: "Rename screen" });
    expect(dialog.getAttribute("aria-describedby")).toBe(screen.getByText("Shown in the sidebar.").id);
    expect(dialog.className).toContain("w-[min(36rem,calc(100vw-2rem))]");
    expect(dialog.className).not.toContain("w-[min(26rem");
    expect(dialog.className).toContain("shadow-ui-modal");
  });

  it("lets a title take another size without keeping the shared one", async () => {
    render(
      <DialogParts.Root open>
        <DialogParts.Content>
          <DialogParts.Title className="text-title">Widgets</DialogParts.Title>
        </DialogParts.Content>
      </DialogParts.Root>
    );
    const title = await screen.findByText("Widgets");
    expect(title.className).toContain("text-title");
    expect(title.className).not.toContain("text-lead");
  });

  it("leaves a panel dialog's layout to it: the frame without the form card's padding and stacking", async () => {
    render(
      <DialogParts.Root open>
        <DialogParts.Content layout="panel" className="flex h-[min(640px,calc(100vh-48px))] flex-col rounded-14 bg-ui-panel">
          <DialogParts.Title>Import</DialogParts.Title>
        </DialogParts.Content>
      </DialogParts.Root>
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toContain("shadow-ui-modal");
    for (const form of ["p-4", "space-y-3", "bg-ui-raised", "rounded-xl"]) expect(dialog.className.split(" ")).not.toContain(form);
  });

  it("closes on Escape and from its Close part", async () => {
    const onOpenChange = vi.fn();
    render(
      <DialogParts.Root open onOpenChange={onOpenChange}>
        <DialogParts.Content>
          <DialogParts.Title>Shortcuts</DialogParts.Title>
          <DialogParts.Close>Done</DialogParts.Close>
        </DialogParts.Content>
      </DialogParts.Root>
    );
    const dialog = await screen.findByRole("dialog");
    await act(async () => {
      fireEvent.keyDown(dialog, { key: "Escape" });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
    });
    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(onOpenChange.mock.calls.every(([open]) => open === false)).toBe(true);
  });
});

describe("AlertDialogParts", () => {
  it("is an alertdialog with the same look", async () => {
    render(
      <AlertDialogParts.Root open>
        <AlertDialogParts.Content>
          <AlertDialogParts.Title>Delete screen?</AlertDialogParts.Title>
          <AlertDialogParts.Close>Cancel</AlertDialogParts.Close>
        </AlertDialogParts.Content>
      </AlertDialogParts.Root>
    );
    const dialog = await screen.findByRole("alertdialog", { name: "Delete screen?" });
    expect(dialog.className).toContain("shadow-ui-modal");
  });
});
