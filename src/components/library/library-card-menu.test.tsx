// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "@/lib/library";
import { buildIndex } from "@/lib/my-library/model";
import { LibraryCard } from "./library-views";

const item = { id: "i", kind: "panel", name: "Panel", createdAt: "", updatedAt: "", files: [], meta: {}, copies: [] } as unknown as LibraryItem;
const index = buildIndex([item], []);

afterEach(cleanup);

const card = (props: Partial<Parameters<typeof LibraryCard>[0]> = {}) =>
  render(<LibraryCard item={item} index={index} selected={false} onSelect={vi.fn()} onOpen={vi.fn()} {...props} />).getByRole("option");

describe("LibraryCard menu", () => {
  it("selects the card and opens the menu at the pointer", () => {
    const onSelect = vi.fn();
    const onMenu = vi.fn();
    const el = card({ onSelect, onMenu });
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 50 });
    el.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalled();
    expect(onMenu).toHaveBeenCalledWith(40, 50);
  });

  it("leaves the event alone without a menu", () => {
    const el = card();
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("asks to remove on Delete", () => {
    const onRemove = vi.fn();
    fireEvent.keyDown(card({ onRemove }), { key: "Delete" });
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("opens from the card at the menu key's 0,0", () => {
    const onMenu = vi.fn();
    const el = card({ onMenu });
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 0, clientY: 0 }));
    expect(onMenu).toHaveBeenCalledWith(12, 12);
  });

  it("asks to remove on Backspace, once per press", () => {
    const onRemove = vi.fn();
    const el = card({ onRemove });
    fireEvent.keyDown(el, { key: "Backspace" });
    fireEvent.keyDown(el, { key: "Backspace", repeat: true });
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("ignores keys from inside the card", () => {
    const onRemove = vi.fn();
    const el = card({ onRemove });
    const input = el.appendChild(document.createElement("input"));
    fireEvent.keyDown(input, { key: "Delete" });
    expect(onRemove).not.toHaveBeenCalled();
  });
});
