// @vitest-environment happy-dom
import { act, render, screen } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { lazyWidget } from "@/widgets/lazy-widget";

const Widget = ({ label }: { label: string }) => <span>{label}</span>;

class Boundary extends Component<{ children: ReactNode }, { error?: unknown }> {
  state: { error?: unknown } = {};
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    return this.state.error ? <p>failed</p> : this.props.children;
  }
}

describe("lazyWidget", () => {
  it("draws nothing until its chunk is in, then the widget", async () => {
    let resolve!: (m: { default: typeof Widget }) => void;
    const Lazy = lazyWidget(() => new Promise<{ default: typeof Widget }>((r) => (resolve = r)));
    const { container } = render(<Lazy label="cpu" />);
    expect(container.innerHTML).toBe("");
    await act(async () => resolve({ default: Widget }));
    expect(screen.getByText("cpu")).toBeTruthy();
  });

  it("renders at once when preloaded", async () => {
    const Lazy = lazyWidget(() => Promise.resolve({ default: Widget }));
    await Lazy.preload();
    const { container } = render(<Lazy label="gpu" />);
    expect(container.textContent).toBe("gpu");
  });

  it("shows a failed chunk as a zone error, and loads it again next time", async () => {
    // React logs the caught error.
    vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    const Lazy = lazyWidget(() => (++calls === 1 ? Promise.reject(new Error("offline")) : Promise.resolve({ default: Widget })));
    await act(async () => {
      render(
        <Boundary>
          <Lazy label="ram" />
        </Boundary>
      );
    });
    expect(screen.getByText("failed")).toBeTruthy();
    await Lazy.preload();
    expect(calls).toBe(2);
    vi.restoreAllMocks();
  });
});
