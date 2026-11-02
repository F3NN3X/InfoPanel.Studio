// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCloseGuard } from "@/components/infopanel/import/use-close-guard";

describe("useCloseGuard", () => {
  it("closes at once while the dialog holds nothing", () => {
    const onOpenChange = vi.fn();
    const { result } = renderHook(() => useCloseGuard(false, onOpenChange));
    act(() => result.current.request());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(result.current.asking).toBe(false);
  });

  it("asks before closing a dialog that holds choices, and Discard then closes it", () => {
    const onOpenChange = vi.fn();
    const { result } = renderHook(() => useCloseGuard(true, onOpenChange));
    act(() => result.current.request());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(result.current.asking).toBe(true);
    act(() => result.current.discard());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(result.current.asking).toBe(false);
  });

  it("keeps the dialog open when the user keeps going", () => {
    const onOpenChange = vi.fn();
    const { result } = renderHook(() => useCloseGuard(true, onOpenChange));
    act(() => result.current.request());
    act(() => result.current.keep());
    expect(result.current.asking).toBe(false);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
