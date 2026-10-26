// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProfileCard } from "@/components/studio/screens/profile-card";
import { screenActions } from "@/components/studio/screens/screen-menu";

const labels = () => screen.getAllByRole("menuitem").map((m) => m.textContent);

describe("a screen card's menus", () => {
  it("the right-click menu and the ⋯ menu list the same actions, and a pick runs it without selecting the card", async () => {
    const onDuplicate = vi.fn();
    const onClick = vi.fn();
    const actions = screenActions({
      onOpen: vi.fn(),
      canDelete: false,
      canMoveEarlier: false,
      canMoveLater: true,
      onRename: vi.fn(),
      onDuplicate,
      onAlwaysOpen: vi.fn(),
      onMove: vi.fn(),
      onCopyLink: vi.fn(),
      onExport: vi.fn(),
      onConvert: vi.fn(),
      onDelete: vi.fn(),
    });
    render(
      <ul>
        <ProfileCard name="Desk" meta="1024×600" aspect={1.7} thumb={null} onClick={onClick} label="Select Desk" actions={actions} actionsLabel="Screen actions" />
      </ul>,
    );

    fireEvent.contextMenu(screen.getByRole("listitem"), { clientX: 20, clientY: 20 });
    const fromRightClick = labels();
    expect(fromRightClick).toEqual(actions.map((a) => a.label));
    expect(screen.getByRole("menuitem", { name: "Delete" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Screen actions" }));
    });
    expect(await screen.findAllByRole("menuitem")).toHaveLength(actions.length);
    expect(labels()).toEqual(fromRightClick);
  });
});
