// @vitest-environment happy-dom
// The dropdown choice shares the menu's look and Base UI's keyboard: open, arrows and Enter, Escape, disabled rows.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Select } from "@/components/ui/select";

afterEach(cleanup);

const user = userEvent.setup();

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta", disabled: true },
  { value: "c", label: "Gamma" },
];

const open = async (value: string | null = "a", onChange = vi.fn()) => {
  render(<Select label="Page" value={value} options={OPTIONS} onChange={onChange} />);
  const trigger = screen.getByRole("combobox", { name: "Page" });
  await act(async () => {
    fireEvent.click(trigger);
  });
  return { trigger, onChange };
};

describe("Select", () => {
  it("shows the chosen label on its trigger and lists every option when opened", async () => {
    const { trigger } = await open("c");
    expect(trigger.textContent).toContain("Gamma");
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("picks a row with the pointer, reports it and closes", async () => {
    const { onChange } = await open();
    const options = await screen.findAllByRole("option");
    await act(async () => {
      fireEvent.pointerDown(options[2]);
      fireEvent.click(options[2]);
    });
    expect(onChange).toHaveBeenCalledWith("c");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("picks with the keyboard: arrow to a row, Enter", async () => {
    const onChange = vi.fn();
    render(<Select label="Page" value="a" options={OPTIONS} onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "Page" });
    trigger.focus();
    await act(async () => {
      await user.keyboard("{ArrowDown}");
    });
    await screen.findAllByRole("option");
    // the first arrow opened it on the chosen row; the next two walk over the disabled row to the last
    await act(async () => {
      await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("never picks a disabled row", async () => {
    const { onChange } = await open();
    const [, beta] = await screen.findAllByRole("option");
    expect(beta.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(beta);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes on Escape without choosing", async () => {
    const { onChange } = await open();
    const [alpha] = await screen.findAllByRole("option");
    alpha.focus();
    await act(async () => {
      await user.keyboard("{Escape}");
    });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
  });
});
