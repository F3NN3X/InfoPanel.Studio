import { useRef, useState } from "react";

interface ThemeNameInputProps {
  initial: string;
  label: string;
  /** The name typed (trimmed), or null when cancelled or left empty. */
  onDone: (name: string | null) => void;
}

/** An inline name field for Rename and Save as theme: Enter commits, Esc cancels, leaving it commits. */
export function ThemeNameInput({ initial, label, onDone }: ThemeNameInputProps) {
  const [name, setName] = useState(initial);
  // Enter, Esc and leaving the field each end it once: the blur that follows Enter or Esc doesn't save again.
  const done = useRef(false);
  const finish = (result: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(result);
  };
  const commit = () => finish(name.trim() || null);
  return (
    <input
      autoFocus
      value={name}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={(e) => {
        // Keep Esc from also stepping the studio's selection out.
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") finish(null);
      }}
      onBlur={commit}
      placeholder={label}
      aria-label={label}
      className="h-7 min-w-0 flex-1 rounded-md border border-ui-default bg-ui-app px-2 text-[12px] text-ui-1 outline-none placeholder:text-ui-4 focus:border-ui-accent"
    />
  );
}
