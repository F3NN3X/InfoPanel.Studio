import { useRef, useState } from "react";

/** The inline name input of the screen (or page) being renamed. */
export function RenameInput({
  initial,
  onDone,
  label = "Screen name",
}: {
  initial: string;
  onDone: (name: string | null) => void;
  label?: string;
}) {
  const [name, setName] = useState(initial);
  // Enter / Esc finish it; the blur the unmount may fire must not finish it again.
  const finished = useRef(false);
  const finish = (value: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(value);
  };
  const commit = () => finish(name.trim() || null);
  return (
    <input
      autoFocus
      value={name}
      onChange={(e) => setName(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") finish(null);
      }}
      onBlur={commit}
      aria-label={label}
      className="w-full rounded border border-ui-strong bg-ui-app px-1.5 py-0.5 text-[12.5px] text-ui-1 outline-none focus:border-ui-accent"
    />
  );
}
