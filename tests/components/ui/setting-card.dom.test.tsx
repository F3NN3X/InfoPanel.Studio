// @vitest-environment happy-dom
// The settings pages' row and card (SettingRow in `card` mode, SettingCard) and the native select field they use.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FOCUS_RING } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { SettingCard, SettingRow } from "@/components/ui/setting-row";
import { Toggle } from "@/components/ui/toggle";

describe("SettingRow", () => {
  it("shows a hint under the label, and announces a rejection", () => {
    render(
      <SettingRow card label="Port" hint="Already in use" hintAlert>
        <input aria-label="Port" />
      </SettingRow>
    );
    expect(screen.getByRole("alert").textContent).toBe("Already in use");
    expect(screen.getByRole("group", { name: "Port" }).getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
  });

  it("is a plain row, not a group, without `card`", () => {
    render(<SettingRow label="Wrap">x</SettingRow>);
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("works the switch when its label is clicked", () => {
    const onChange = vi.fn();
    render(
      <SettingRow card label="Start with Windows">
        <Toggle checked={false} onChange={onChange} label="Start with Windows" />
      </SettingRow>
    );
    fireEvent.click(screen.getByText("Start with Windows"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("focuses the field when its label is clicked", () => {
    render(
      <SettingRow card label="Address">
        <input aria-label="Address" />
      </SettingRow>
    );
    fireEvent.click(screen.getByText("Address", { selector: "span" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Address" }));
  });

  it("does not click a disabled control", () => {
    const onChange = vi.fn();
    render(
      <SettingRow card label="Locked">
        <Toggle checked={false} onChange={onChange} label="Locked" disabled />
      </SettingRow>
    );
    fireEvent.click(screen.getByText("Locked"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("passes a ref and attributes to the row (search jumps to it)", () => {
    const ref = { current: null as HTMLDivElement | null };
    render(
      <SettingRow card ref={ref} data-testid="row" label="Zoom">
        x
      </SettingRow>
    );
    expect(ref.current).toBe(screen.getByTestId("row"));
  });
});

describe("SettingCard", () => {
  it("draws its rows with dividers between them", () => {
    render(
      <SettingCard data-testid="card">
        <SettingRow card label="One">x</SettingRow>
        <SettingRow card label="Two">y</SettingRow>
      </SettingCard>
    );
    expect(screen.getByTestId("card").className).toContain("divide-y");
  });
});

describe("SelectField", () => {
  const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
  ];

  it("carries the field's focus ring and reports a change", () => {
    const onChange = vi.fn();
    render(<SelectField aria-label="Choice" options={options} value="a" onChange={(e) => onChange(e.target.value)} />);
    const select = screen.getByLabelText("Choice") as HTMLSelectElement;
    for (const cls of FOCUS_RING.split(" ")) expect(select.className).toContain(cls);
    fireEvent.change(select, { target: { value: "b" } });
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("titles the closed select with the whole selected label", () => {
    render(<SelectField aria-label="Choice" options={options} value="b" onChange={() => {}} />);
    expect(screen.getByLabelText("Choice").getAttribute("title")).toBe("Beta");
  });

  it("can be disabled", () => {
    render(<SelectField aria-label="Choice" options={options} value="a" onChange={() => {}} disabled />);
    expect((screen.getByLabelText("Choice") as HTMLSelectElement).disabled).toBe(true);
  });
});
