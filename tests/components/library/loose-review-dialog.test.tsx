// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "@/lib/assets";
import { LooseReviewDialog } from "@/components/library/loose-review-dialog";

const api = vi.hoisted(() => ({ unusedAssets: vi.fn(), deleteAsset: vi.fn() }));
vi.mock("@/lib/assets", async (importOriginal) => ({ ...(await importOriginal<object>()), ...api }));

const id = (c: string) => `${c.repeat(64)}.png`;
const asset = (c: string): Asset => ({ id: id(c), url: `/api/assets/${id(c)}`, type: "image/png", kind: "image", size: 2048, mtime: 1 });
const name = (c: string) => `Upload ${c.repeat(8)}.png`;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// "a" and "b" are unused; "c" is still referenced by a profile.
const open = async (config = "{}") => {
  api.unusedAssets.mockResolvedValue([asset("a"), asset("b")]);
  api.deleteAsset.mockResolvedValue(undefined);
  const onChanged = vi.fn();
  render(<LooseReviewDialog open loose={[asset("a"), asset("b"), asset("c")]} config={config} onClose={vi.fn()} onImport={vi.fn()} onChanged={onChanged} onResult={vi.fn()} />);
  await screen.findAllByText("Used by a profile");
  return { user: userEvent.setup(), onChanged };
};
const del = () => screen.getByRole("button", { name: "Delete…" }) as HTMLButtonElement;

describe("LooseReviewDialog", () => {
  it("refuses to delete a used file", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("checkbox", { name: name("c") }));
    expect(del().disabled).toBe(true);
    expect(del().title).toMatch(/still uses/);
    await user.click(screen.getByRole("checkbox", { name: name("a") }));
    expect(del().disabled).toBe(true);
    expect(api.deleteAsset).not.toHaveBeenCalled();
  });

  it("treats a file the live config names as used", async () => {
    await open(JSON.stringify({ src: id("a") }));
    expect(screen.getAllByText("Used by a profile")).toHaveLength(2);
  });

  it("deletes only the selected unused files, after a confirm", async () => {
    const { user, onChanged } = await open();
    await user.click(screen.getByRole("button", { name: "Select unused" }));
    expect(screen.getByText("2 of 3 selected")).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: name("b") }));
    await user.click(del());
    expect(api.deleteAsset).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(api.deleteAsset.mock.calls).toEqual([[id("a")]]);
  });

  it("reports a delete that fails and still deletes the rest", async () => {
    api.unusedAssets.mockResolvedValue([asset("a"), asset("b")]);
    api.deleteAsset.mockImplementation(async (x: string) => {
      if (x === id("a")) throw new Error("gone");
    });
    const onResult = vi.fn();
    const onChanged = vi.fn();
    render(<LooseReviewDialog open loose={[asset("a"), asset("b")]} config="{}" onClose={vi.fn()} onImport={vi.fn()} onChanged={onChanged} onResult={onResult} />);
    const user = userEvent.setup();
    await waitFor(() => expect((screen.getByRole("button", { name: "Select unused" }) as HTMLButtonElement).disabled).toBe(false));
    await waitFor(() => expect(api.unusedAssets).toHaveBeenCalled());
    await user.click(screen.getByRole("checkbox", { name: name("a") }));
    await user.click(screen.getByRole("checkbox", { name: name("b") }));
    await waitFor(() => expect(del().disabled).toBe(false));
    await user.click(del());
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(api.deleteAsset).toHaveBeenCalledTimes(2);
    expect(onResult).toHaveBeenCalledWith("Deleted 1 uploaded file, 1 failed");
  });

  it("keeps Delete off when the use check fails", async () => {
    api.unusedAssets.mockRejectedValue(new Error("down"));
    render(<LooseReviewDialog open loose={[asset("a")]} config="{}" onClose={vi.fn()} onImport={vi.fn()} onChanged={vi.fn()} onResult={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("checkbox", { name: name("a") }));
    await waitFor(() => expect(del().title).toBe("Couldn't check which files are in use"));
    expect(del().disabled).toBe(true);
  });
});
