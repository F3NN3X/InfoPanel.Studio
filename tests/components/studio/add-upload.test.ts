import { beforeEach, describe, expect, it, vi } from "vitest";
import { addUpload } from "@/components/studio/add-upload";

const m = vi.hoisted(() => ({ addFileToLibrary: vi.fn(), listLibrary: vi.fn() }));
vi.mock("@/components/library/add-file", () => ({ addFileToLibrary: m.addFileToLibrary }));
vi.mock("@/lib/library", () => ({ listLibrary: m.listLibrary }));

const file = new File([new Uint8Array(2)], "w.png");
beforeEach(() => vi.clearAllMocks());

describe("addUpload", () => {
  it("adds the uploaded asset against the current library, so a held one is reused", async () => {
    m.listLibrary.mockResolvedValue([{ id: "x" }]);
    await addUpload(file, "abc.png");
    expect(m.addFileToLibrary).toHaveBeenCalledWith(file, [{ id: "x" }], "abc.png");
  });

  it("swallows a failure: the upload still stands", async () => {
    m.listLibrary.mockRejectedValue(new Error("down"));
    await expect(addUpload(file, "abc.png")).resolves.toBeUndefined();
  });
});
