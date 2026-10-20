// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "@/lib/library";
import { buildIndex } from "@/lib/my-library/model";
import { LibraryDetail } from "./library-detail";

const item = { id: "i", kind: "panel", name: "Panel", createdAt: "", updatedAt: "", files: [], meta: {}, copies: [] } as unknown as LibraryItem;

afterEach(cleanup);

describe("LibraryDetail rename", () => {
  it("focuses the name when Rename is asked for on a mounted pane", () => {
    const onFocusedName = vi.fn();
    const props = { item, index: buildIndex([item]), primary: null, secondary: [], onRename: vi.fn(), onRemove: vi.fn(), onMerge: vi.fn(), onVideo: vi.fn(), copyLabel: () => "", onJump: vi.fn(), onFocusedName };
    const { rerender, getByLabelText } = render(<LibraryDetail {...props} focusName={false} />);
    expect(document.activeElement).not.toBe(getByLabelText("Name"));
    rerender(<LibraryDetail {...props} focusName />);
    expect(document.activeElement).toBe(getByLabelText("Name"));
    expect(onFocusedName).toHaveBeenCalledOnce();
  });
});
