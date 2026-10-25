// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DisplaysList, seenAgo } from "@/components/studio/screens/displays-list";
import type { ControlDisplay } from "@/lib/control";

const api = vi.hoisted(() => ({ postControl: vi.fn(async () => null) }));
vi.mock("@/lib/control", async (importOriginal) => ({ ...(await importOriginal<object>()), postControl: api.postControl }));

afterEach(() => vi.clearAllMocks());

const profiles = [
  { id: "desk", name: "Desk" },
  { id: "strip", name: "Strip" },
];
const display = (over: Partial<ControlDisplay>): ControlDisplay => ({
  name: "hall",
  screen: "follow",
  firstSeen: 0,
  lastSeen: Date.now(),
  online: true,
  address: "127.0.0.1",
  shows: "desk",
  ...over,
});

describe("DisplaysList", () => {
  it("shows an online and an offline display, assigns a screen and forgets one", () => {
    const old = Date.now() - 3 * 3_600_000;
    render(<DisplaysList displays={[display({}), display({ name: "wall", online: false, address: null, lastSeen: old })]} profiles={profiles} />);
    expect(screen.getByText("Online")).toBeTruthy();
    expect(screen.getByText("127.0.0.1")).toBeTruthy();
    expect(screen.getByText("Offline · seen 3 h ago")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Screen for hall"), { target: { value: "strip" } });
    expect(api.postControl).toHaveBeenCalledWith("display", { action: "assign", display: "hall", screen: "strip" });
    fireEvent.click(screen.getAllByText("Forget")[1]);
    expect(api.postControl).toHaveBeenCalledWith("display", { action: "forget", display: "wall" });
  });

  it("renders nothing without displays", () => {
    const { container } = render(<DisplaysList displays={[]} profiles={profiles} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("seenAgo", () => {
  it("rounds to minutes, hours and days", () => {
    expect([0, 5 * 60_000, 2 * 3_600_000, 3 * 86_400_000].map((ms) => seenAgo(1000, 1000 + ms))).toEqual(["just now", "5 min ago", "2 h ago", "3 d ago"]);
  });
});
