// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chatHoursPerDay, YoutubeBlock, type YoutubeBlockProps } from "@/components/connections/youtube-block";
import { EMPTY_YOUTUBE } from "@/lib/extras";

afterEach(cleanup);

const props = (over: Partial<YoutubeBlockProps> = {}): YoutubeBlockProps => ({
  state: EMPTY_YOUTUBE,
  clientConfigured: false,
  chatInterval: 10,
  pending: null,
  onSaveClient: vi.fn(async () => true),
  onSaveInterval: vi.fn(async () => true),
  onSignin: vi.fn(async () => ({ ok: true as const, authUrl: "https://accounts.google.com/o/oauth2/v2/auth?x=1" })),
  onCancel: vi.fn(),
  onSignout: vi.fn(),
  onOpen: vi.fn(),
  now: () => 1_000_000,
  ...over,
});

describe("YoutubeBlock", () => {
  it("asks for the client first: sign-in waits for a saved client, and the secret is sent only when typed", async () => {
    const p = props();
    render(<YoutubeBlock {...p} />);
    expect(screen.getByText("Not set up")).toBeTruthy();
    expect((screen.getByText("Sign in with Google") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText("Save client") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Google client ID"), { target: { value: " abc.apps " } });
    fireEvent.change(screen.getByLabelText("Google client secret"), { target: { value: "shh" } });
    fireEvent.click(screen.getByText("Save client"));
    await waitFor(() => expect(p.onSaveClient).toHaveBeenCalledWith("abc.apps", "shh"));
    // The fields are cleared once saved: the secret is never shown back.
    await waitFor(() => expect((screen.getByLabelText("Google client secret") as HTMLInputElement).value).toBe(""));
  });

  it("opens Google in the browser on sign-in and shows a refusal plainly", async () => {
    const p = props({ clientConfigured: true });
    const { unmount } = render(<YoutubeBlock {...p} />);
    expect(screen.getByText("Signed out")).toBeTruthy();
    fireEvent.click(screen.getByText("Sign in with Google"));
    await waitFor(() => expect(p.onOpen).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?x=1"));
    unmount();
    const bad = props({ clientConfigured: true, onSignin: vi.fn(async () => ({ ok: false as const, error: "Enter the Client ID first." })) });
    render(<YoutubeBlock {...bad} />);
    fireEvent.click(screen.getByText("Sign in with Google"));
    expect(await screen.findByText("Enter the Client ID first.")).toBeTruthy();
    expect(bad.onOpen).not.toHaveBeenCalled();
  });

  it("waits for approval with a countdown, Open again and Cancel", () => {
    const pending = { authUrl: "https://accounts.google.com/x", expiresAt: 1_000_000 + 125_000 };
    const p = props({ clientConfigured: true, state: { ...EMPTY_YOUTUBE, clientConfigured: true, pending: true }, pending });
    render(<YoutubeBlock {...p} />);
    expect(screen.getByText("Waiting for approval")).toBeTruthy();
    expect(screen.getByText("Expires in 2:05")).toBeTruthy();
    expect(screen.queryByText("Sign in with Google")).toBeNull();
    fireEvent.click(screen.getByText("Open again"));
    expect(p.onOpen).toHaveBeenCalledWith("https://accounts.google.com/x");
    fireEvent.click(screen.getByText("Cancel"));
    expect(p.onCancel).toHaveBeenCalled();
  });

  it("shows the channel, the chat refresh with its hours a day, the quota and signs out", async () => {
    const state = { ...EMPTY_YOUTUBE, clientConfigured: true, signedIn: true, channel: "My Channel", live: true, connected: true, quota: { used: 1234, estimatePerHour: 1920 } };
    const p = props({ clientConfigured: true, state, chatInterval: 10 });
    render(<YoutubeBlock {...p} />);
    expect(screen.getByText("Chat connected")).toBeTruthy();
    expect(screen.getByText("My Channel")).toBeTruthy();
    expect(screen.getByText("About 5.6 hours of live chat a day.")).toBeTruthy();
    expect(screen.getByText(/About 1,234 of 10,000 units used today, about 1,920 an hour/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Chat refresh"), { target: { value: "20" } });
    await waitFor(() => expect(p.onSaveInterval).toHaveBeenCalledWith(20));
    fireEvent.click(screen.getByText("Sign out"));
    expect(p.onSignout).toHaveBeenCalled();
    expect(screen.queryByLabelText("Google client secret")).toBeNull();
  });

  it("shows the server's error, such as a used-up quota", () => {
    render(<YoutubeBlock {...props({ clientConfigured: true, state: { ...EMPTY_YOUTUBE, error: "YouTube's daily API quota is used up; it resets at midnight Pacific." } })} />);
    expect(screen.getByText(/daily API quota is used up/)).toBeTruthy();
  });
});

describe("chatHoursPerDay", () => {
  it("is the quota over the chat reads an hour", () => {
    expect([5, 10, 20].map(chatHoursPerDay)).toEqual([2.8, 5.6, 11.1]);
  });
});
