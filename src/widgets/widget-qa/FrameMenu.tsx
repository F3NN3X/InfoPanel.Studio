import { useState } from "react";
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
 * copied before), Copy link and Copy for Claude. Always in the DOM and shown on hover or focus, so hovering adds no elements; the
 * trigger reads "copied" for a moment after a copy.
 */
export function FrameMenu({ name, reference, claude, onInspect }: FrameMenuProps) {
  const [status, setStatus] = useState("");
  const copy = async (text: () => string | Promise<string>) => {
    setStatus((await copyText(await text())) ? "copied" : "copy failed");
    setTimeout(() => setStatus(""), 1500);
  };
  return (
    <Menu.Root>
      <Menu.Trigger
        data-qa-ui=""
        aria-label={`Frame menu: ${name}`}
        onClick={(e) => e.stopPropagation()}
        className={`absolute top-1 right-1 z-30 inline-flex h-6 min-w-6 items-center justify-center rounded-ui-md border border-ui-strong bg-ui-raised px-1 font-ui text-micro text-ui-2 hover:text-ui-1 focus-visible:visible focus-visible:outline-2 focus-visible:outline-ui-accent data-popup-open:visible ${status ? "" : "invisible group-hover/frame:visible"}`}
      >
        {status || "⋯"}
      </Menu.Trigger>
      <Menu.Content align="end" data-qa-ui="">
        <Menu.Item onClick={onInspect}>Inspect</Menu.Item>
        <Menu.Item onClick={() => void copy(() => reference().text)}>Copy reference</Menu.Item>
        <Menu.Item onClick={() => void copy(() => reference().url)}>Copy link</Menu.Item>
        {claude && <Menu.Item onClick={() => void copy(claude)}>Copy for Claude</Menu.Item>}
      </Menu.Content>
    </Menu.Root>
  );
}
