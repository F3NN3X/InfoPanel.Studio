// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { countdown, TwitchBlock, type TwitchBlockProps } from "@/components/connections/twitch-block";
import { EMPTY_TWITCH } from "@/lib/extras";

afterEach(cleanup);

const props = (over: Partial<TwitchBlockProps> = {}): TwitchBlockProps => ({
  state: EMPTY_TWITCH,
  pending: null,
  channel: "",
  onSignin: vi.fn(async () => ({ ok: true as const, userCode: "AB", verificationUri: "u", expiresIn: 1 })),
  onCancel: vi.fn(),
  onSignout: vi.fn(),
  onSaveChannel: vi.fn(async () => true),
  onOpen: vi.fn(),
  now: () => 1_000_000,
  ...over,
});

describe("TwitchBlock", () => {
  it("offers sign-in when signed out and shows a refusal plainly", async () => {
    const p = props({ onSignin: vi.fn(async () => ({ ok: false as const, error: "couldn't reach Twitch" })) });
    render(<TwitchBlock {...p} />);
    fireEvent.click(screen.getByText("Sign in with Twitch"));
    expect(await screen.findByText("couldn't reach Twitch")).toBeTruthy();
    expect(p.onSignin).toHaveBeenCalledTimes(1);
  });

  it("shows the code big with the activate link, a countdown and Cancel while a sign-in is pending", () => {
    const pending = { userCode: "ABCD-EFGH", verificationUri: "https://www.twitch.tv/activate", expiresAt: 1_000_000 + 125_000 };
    const p = props({ state: { ...EMPTY_TWITCH, pending: true }, pending });
    render(<TwitchBlock {...p} />);
    expect(screen.getByLabelText("Twitch code").textContent).toBe("ABCD-EFGH");
    expect(screen.getByText("Expires in 2:05")).toBeTruthy();
    fireEvent.click(screen.getByText("https://www.twitch.tv/activate"));
    expect(p.onOpen).toHaveBeenCalledWith("https://www.twitch.tv/activate");
    fireEvent.click(screen.getByText("Cancel"));
    expect(p.onCancel).toHaveBeenCalled();
    expect(screen.queryByText("Sign in with Twitch")).toBeNull();
  });

  it("links only to twitch.tv over https, whatever address the server sent", () => {
    const pending = { userCode: "AB", verificationUri: "https://evil.example/activate", expiresAt: 1_000_000 + 5000 };
    const p = props({ state: { ...EMPTY_TWITCH, pending: true }, pending });
    render(<TwitchBlock {...p} />);
    fireEvent.click(screen.getByText("https://www.twitch.tv/activate"));
    expect(p.onOpen).toHaveBeenCalledWith("https://www.twitch.tv/activate");
  });

  it("shows the login, saves the chat channel and signs out when signed in", async () => {
    const p = props({ state: { ...EMPTY_TWITCH, signedIn: true, login: "streamer", connected: true }, channel: "" });
    render(<TwitchBlock {...p} />);
    expect(screen.getByText("streamer")).toBeTruthy();
    expect(screen.getByText("Chat connected")).toBeTruthy();
    const input = screen.getByLabelText("Twitch chat channel") as HTMLInputElement;
    expect(input.placeholder).toBe("streamer");
    fireEvent.change(input, { target: { value: " friend " } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(p.onSaveChannel).toHaveBeenCalledWith("friend"));
    fireEvent.click(screen.getByText("Sign out"));
    expect(p.onSignout).toHaveBeenCalled();
  });

  it("shows the server's error, such as a sign-in that ran out", () => {
    render(<TwitchBlock {...props({ state: { ...EMPTY_TWITCH, error: "Your Twitch sign-in ran out. Sign in again." } })} />);
    expect(screen.getByText("Your Twitch sign-in ran out. Sign in again.")).toBeTruthy();
    expect(screen.getByText("Sign in with Twitch")).toBeTruthy();
  });
});

describe("countdown", () => {
  it("counts down in m:ss and stops at zero", () => {
    expect(countdown(61_000, 0)).toBe("1:01");
    expect(countdown(0, 5000)).toBe("0:00");
  });
});
