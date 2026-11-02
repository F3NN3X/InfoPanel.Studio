// @vitest-environment happy-dom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/library", () => ({ getLibraryItem: async () => ({ data: {} }), listLibrary: async () => [] }));
vi.mock("@/lib/infopanel/canvas", () => ({ readStoreFile: vi.fn() }));
vi.mock("@/lib/infopanel/import/session", () => ({
  INSTALLED_URL: "/installed",
  folderEntries: vi.fn(),
  installedEntries: vi.fn(),
  openEntries: vi.fn(),
  openZip: vi.fn(),
  openStored: async () => ({ name: "Canvas", parsed: { profile: { Name: "Canvas" } } }),
}));
vi.mock("@/components/infopanel/import/use-import", () => ({
  useImport: (source: unknown) =>
    source ? { mode: "native", online: false, unresolved: 0, source: { assets: new Map() }, report: { items: { total: 3 }, fonts: { requests: 0 } }, upload: { finished: true, failed: [], ids: new Map(), done: 0, total: 0 } } : null,
}));
vi.mock("@/components/infopanel/import/import-steps", () => ({
  ModeStep: () => <div>mode step</div>,
  ReviewStep: () => <div>review step</div>,
  SaveStep: () => <div>save step</div>,
  Radio: () => null,
}));
vi.mock("@/components/infopanel/remap-panel", () => ({ RemapPanel: () => null }));

const { ImportDialog } = await import("@/components/infopanel/import/import-dialog");

function Harness({ onClosed }: { onClosed: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <ImportDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) onClosed();
      }}
      profileName="Main"
      profileSize={{ width: 800, height: 480 }}
      onImport={async () => null}
      initialSource={{ canvasId: "c1" }}
    />
  );
}

async function openAtMode() {
  const user = userEvent.setup({ delay: null });
  const onClosed = vi.fn();
  render(<Harness onClosed={onClosed} />);
  const next = await screen.findByRole("button", { name: "Continue" });
  await waitFor(() => expect((next as HTMLButtonElement).disabled).toBe(false));
  await user.click(next);
  await screen.findByText("mode step");
  return { user, onClosed };
}

describe("ImportDialog closing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("closes at once on Escape at the first step", async () => {
    const user = userEvent.setup({ delay: null });
    const onClosed = vi.fn();
    render(<Harness onClosed={onClosed} />);
    await screen.findByRole("button", { name: "Continue" });
    await user.keyboard("{Escape}");
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Escape", (u: ReturnType<typeof userEvent.setup>) => u.keyboard("{Escape}")],
    ["the close button", (u: ReturnType<typeof userEvent.setup>) => u.click(screen.getByRole("button", { name: "Close" }))],
    ["Cancel", (u: ReturnType<typeof userEvent.setup>) => u.click(screen.getByRole("button", { name: "Cancel" }))],
  ])("asks before %s discards the import past the first step", async (_name, close) => {
    const { user, onClosed } = await openAtMode();
    await close(user);
    expect(await screen.findByText("Discard this import?")).toBeTruthy();
    expect(onClosed).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("Escape on the question keeps the import open, once", async () => {
    const { user, onClosed } = await openAtMode();
    await user.keyboard("{Escape}");
    await screen.findByText("Discard this import?");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Discard this import?")).toBeNull());
    expect(onClosed).not.toHaveBeenCalled();
    expect(screen.getByText("mode step")).toBeTruthy();
  });
});
