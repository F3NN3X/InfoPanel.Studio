import { useEffect, useRef, useState } from "react";
import { Menu } from "@/components/ui/menu";
import { copyText } from "./clipboard";

interface FrameMenuProps {
  /** The frame's name (`CpuMonitor 2x1`), for the trigger's label. */
  name: string;
  /** The frame's reference and link (`frameRef`), read when picked. */
  reference: () => { text: string; url: string };
  /** The frame's Copy for Claude text; unset: no row. */
  claude?: () => Promise<string>;
  onInspect: () => void;
}

/**
 * A frame's hover menu, over its top right corner and outside its box (`data-qa-ui`): Inspect, Copy reference (what the caption
 * copied before), Copy link and Copy for Claude. The trigger is always in the DOM, so hovering adds no elements: shown while the frame
 * is hovered or the menu is open, and it reads "copied" for a moment after a copy. The keyboard has the same actions on the caption
 * (Enter selects, `c` copies the reference) and in the inspector.
 *
 * Cheap per frame, since there are hundreds: a plain button, and Base UI's Menu mounted only while open (one per frame doubled the
 * page's heap at rest). Hover is the frame's own listener, not a `group` class: a widget's `group-hover:` would answer to the frame's
 * group too, and a class no other part of the app uses would land in its shared CSS.
 */
export function FrameMenu({ name, reference, claude, onInspect }: FrameMenuProps) {
  const [status, setStatus] = useState("");
  const [hover, setHover] = useState(false);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const frame = trigger.current?.parentElement;
    if (!frame) return;
    const on = () => setHover(true);
    const off = () => setHover(false);
    frame.addEventListener("mouseenter", on);
    frame.addEventListener("mouseleave", off);
    return () => {
      frame.removeEventListener("mouseenter", on);
      frame.removeEventListener("mouseleave", off);
    };
  }, []);
  const copy = async (text: () => string | Promise<string>) => {
    setStatus((await copyText(await text())) ? "copied" : "copy failed");
    setTimeout(() => setStatus(""), 1500);
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        data-qa-ui=""
        aria-label={`Frame menu: ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="absolute top-1 right-1 z-30 inline-flex h-6 min-w-6 items-center justify-center rounded-ui-md border border-ui-strong bg-ui-raised px-1 font-ui text-micro text-ui-2 hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-ui-accent"
        style={{ visibility: hover || open || status ? "visible" : "hidden" }}
      >
        {status || "⋯"}
      </button>
      {open && (
        <Menu.Root open onOpenChange={(next) => !next && setOpen(false)}>
          <Menu.Content anchor={trigger} align="end" data-qa-ui="">
            <Menu.Item onClick={onInspect}>Inspect</Menu.Item>
            <Menu.Item onClick={() => void copy(() => reference().text)}>Copy reference</Menu.Item>
            <Menu.Item onClick={() => void copy(() => reference().url)}>Copy link</Menu.Item>
            {claude && <Menu.Item onClick={() => void copy(claude)}>Copy for Claude</Menu.Item>}
          </Menu.Content>
        </Menu.Root>
      )}
    </>
  );
}
