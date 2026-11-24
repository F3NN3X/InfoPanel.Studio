import { useState } from "react";
import { copyText } from "./clipboard";

interface ClaudeButtonProps {
  /** The text to copy (`claudeText`), read when clicked. */
  text: () => Promise<string>;
  title: string;
  className: string;
  label?: string;
}

/** Copy for Claude: copies the text and reads "copied" (or "copy failed") for a moment in place of its label. */
export function ClaudeButton({ text, title, className, label = "Copy for Claude" }: ClaudeButtonProps) {
  const [status, setStatus] = useState("");
  const copy = async () => {
    setStatus("copying…");
    setStatus((await copyText(await text())) ? "copied" : "copy failed");
    setTimeout(() => setStatus(""), 1500);
  };
  return (
    <button type="button" title={title} onClick={copy} className={className}>
      {status || label}
    </button>
  );
}
