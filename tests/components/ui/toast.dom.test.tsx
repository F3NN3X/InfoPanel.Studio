// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_ERROR_MS, TOAST_MS, ToastProvider, toastDuration, useToast } from "@/components/ui/toast";

type Options = Parameters<ReturnType<typeof useToast>>[1];

function Fire({ message, options }: { message: string; options?: Options }) {
  const toast = useToast();
  return <button onClick={() => toast(message, options)}>fire</button>;
}

const fire = (message: string, options?: Options) => {
  const view = render(
    <ToastProvider>
      <Fire message={message} options={options} />
    </ToastProvider>
  );
  fireEvent.click(screen.getByText("fire"));
  return view;
};

const regions = () => screen.getAllByRole("status");
const polite = () => regions().find((r) => r.getAttribute("aria-live") === "polite")!;
const assertive = () => regions().find((r) => r.getAttribute("aria-live") === "assertive")!;

describe("toast timing", () => {
  it("keeps a failure up longer than a confirmation, and an action until it is dismissed", () => {
    expect(toastDuration("Copied")).toBe(TOAST_MS);
    expect(toastDuration("Not saved: disk full")).toBe(TOAST_ERROR_MS);
    expect(toastDuration("Couldn’t reach the server")).toBe(TOAST_ERROR_MS);
    expect(toastDuration("Deleted A", { action: { label: "Undo", onClick: () => {} } })).toBeNull();
  });
});

describe("ToastProvider", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("mounts both live regions empty, and fills the polite one for a confirmation", () => {
    render(
      <ToastProvider>
        <Fire message="Copied" />
      </ToastProvider>
    );
    expect(polite().textContent).toBe("");
    expect(assertive().textContent).toBe("");
    fireEvent.click(screen.getByText("fire"));
    expect(polite().textContent).toBe("Copied");
    expect(assertive().textContent).toBe("");
  });

  it("puts a failure in the assertive region and keeps it for the failure time", () => {
    fire("Not saved: disk full");
    expect(assertive().textContent).toContain("Not saved: disk full");
    expect(polite().textContent).toBe("");
    act(() => void vi.advanceTimersByTime(TOAST_ERROR_MS - 1));
    expect(assertive().textContent).toContain("Not saved");
    act(() => void vi.advanceTimersByTime(1));
    expect(assertive().textContent).toBe("");
  });

  it("goes after its time", () => {
    fire("Copied");
    act(() => void vi.advanceTimersByTime(TOAST_MS));
    expect(polite().textContent).toBe("");
  });

  it("pauses while hovered and goes after it is left", () => {
    fire("Copied");
    fireEvent.pointerEnter(polite());
    act(() => void vi.advanceTimersByTime(TOAST_MS * 3));
    expect(polite().textContent).toBe("Copied");
    fireEvent.pointerLeave(polite());
    act(() => void vi.advanceTimersByTime(TOAST_MS));
    expect(polite().textContent).toBe("");
  });

  it("pauses while a button inside has the focus", () => {
    fire("Not saved", { error: true });
    fireEvent.focus(screen.getByLabelText("Dismiss"));
    act(() => void vi.advanceTimersByTime(TOAST_ERROR_MS * 2));
    expect(assertive().textContent).toContain("Not saved");
    fireEvent.blur(screen.getByLabelText("Dismiss"));
    act(() => void vi.advanceTimersByTime(TOAST_ERROR_MS));
    expect(assertive().textContent).toBe("");
  });

  it("keeps an Undo toast past any timer until it is dismissed", () => {
    fire("Deleted A", { action: { label: "Undo", onClick: () => {} } });
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getByText("Undo")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText("Undo")).toBeNull();
  });
});
