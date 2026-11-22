// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode, useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NumberInput, Slider, TextInput, TypingContext } from "@/components/widgets-page/fields";

// G5 and B1: a text or number field commits on blur or Enter, so a word typed is one change (one undo step); while it is typed
// each keystroke is a preview (the stage shows it), and Escape puts the value back. A slider's drag is one change.

afterEach(cleanup);

/** The builder's typing context, counting previews and cancels. */
function setup(ui: (onChange: (v: unknown) => void) => ReactNode) {
  const onChange = vi.fn();
  const previews: unknown[] = [];
  let previewing = false;
  const cancel = vi.fn();
  const changes: unknown[] = [];
  const handle = (v: unknown) => (previewing ? previews.push(v) : (changes.push(v), onChange(v)));
  render(
    <TypingContext.Provider
      value={{
        preview: (run) => {
          previewing = true;
          run();
          previewing = false;
        },
        cancel,
      }}
    >
      {ui(handle)}
    </TypingContext.Provider>,
  );
  return { onChange, previews, changes, cancel };
}

describe("builder fields", () => {
  it("a ten-character name is one change, committed on blur; each keystroke a preview (B1)", () => {
    const { changes, previews } = setup((onChange) => <TextInput label="Name" value="" onChange={onChange} />);
    const input = screen.getByLabelText("Name");
    fireEvent.focus(input);
    let typed = "";
    for (const ch of "Big ring 1") fireEvent.change(input, { target: { value: (typed += ch) } });
    expect(changes).toEqual([]);
    expect(previews).toHaveLength(10);
    expect(previews.at(-1)).toBe("Big ring 1");
    fireEvent.blur(input);
    expect(changes).toEqual(["Big ring 1"]);
  });

  it("Enter commits, Escape puts the value back, and an unchanged value commits nothing", () => {
    const a = setup((onChange) => <NumberInput label="Decimals" value={1} onChange={onChange} />);
    const input = screen.getByLabelText("Decimals") as HTMLInputElement;
    input.focus();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(a.changes).toEqual([3]);
    cleanup();
    const b = setup((onChange) => <NumberInput label="Decimals" value={1} onChange={onChange} />);
    const again = screen.getByLabelText("Decimals") as HTMLInputElement;
    again.focus();
    fireEvent.focus(again);
    fireEvent.change(again, { target: { value: "3" } });
    fireEvent.keyDown(again, { key: "Escape" });
    expect(b.changes).toEqual([]);
    expect(b.cancel).toHaveBeenCalled();
    expect(again.value).toBe("1");
    fireEvent.focus(again);
    fireEvent.blur(again);
    expect(b.changes).toEqual([]);
  });

  it("an emptied field shows empty while it is typed; what an empty value means is the caller's on commit (B2)", () => {
    const { changes } = setup((onChange) => <TextInput label="Option label" value="History" onChange={(v) => onChange(v || "History")} />);
    const input = screen.getByLabelText("Option label") as HTMLInputElement;
    fireEvent.focus(input);
    for (let n = "History".length - 1; n >= 0; n--) fireEvent.change(input, { target: { value: "History".slice(0, n) } });
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "Hours" } });
    fireEvent.blur(input);
    expect(changes).toEqual(["Hours"]);
  });

  it("a slider drag is one change, committed when it ends", () => {
    const { changes, previews } = setup((onChange) => <Slider label="Thickness" min={2} max={24} value={8} onChange={onChange} />);
    const slider = screen.getByLabelText("Thickness");
    fireEvent.pointerDown(slider);
    for (const v of [9, 10, 11, 12, 13]) fireEvent.change(slider, { target: { value: String(v) } });
    expect(changes).toEqual([]);
    expect(previews).toEqual([9, 10, 11, 12, 13]);
    fireEvent.pointerUp(slider);
    expect(changes).toEqual([13]);
  });
});

function Host({ commits }: { commits: string[] }) {
  const [shown, setShown] = useState("Ring");
  const previewing = useRef(false);
  const typing = {
    preview: (run: () => void) => {
      previewing.current = true;
      run();
      previewing.current = false;
    },
    cancel: () => setShown("Ring"),
  };
  return (
    <TypingContext.Provider value={typing}>
      <TextInput label="Name" value={shown} onChange={(v) => (previewing.current ? setShown(v) : commits.push(v))} />
    </TypingContext.Provider>
  );
}

describe("builder fields over a preview", () => {
  it("commits what was typed even though the value shown meanwhile is the preview's (the builder's case)", () => {
    const commits: string[] = [];
    render(<Host commits={commits} />);
    const input = screen.getByLabelText("Name");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Top row" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(commits).toEqual(["Top row"]);
  });
});
