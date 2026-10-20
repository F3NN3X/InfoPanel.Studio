import { useEffect, type KeyboardEvent, type RefObject } from "react";
import { Search, X } from "lucide-react";
import { Kbd } from "./kbd";

/** Ctrl/Cmd+K focuses (and selects) the field. */
export function useSearchShortcut(input: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [input]);
}

interface SearchBoxProps {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** The placeholder and the accessible name. */
  label: string;
}

/** The 34px sidebar search field: a clear button once there is text, the `Ctrl K` hint before. */
export function SearchBox({ inputRef, value, onChange, onKeyDown, label }: SearchBoxProps) {
  return (
    <div className="flex h-[34px] items-center gap-2 rounded-[9px] border border-s-track-line bg-[#141418] px-2.5">
      <Search className="h-[17px] w-[17px] shrink-0 text-s-dim" />
      <input
        ref={inputRef}
        value={value}
        placeholder={label}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-s-t1 outline-none placeholder:text-s-dim"
      />
      {value ? (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")} className="grid cursor-pointer border-0 bg-transparent p-0 text-s-dim hover:text-s-t1">
          <X className="h-4 w-4" />
        </button>
      ) : (
        <Kbd>Ctrl K</Kbd>
      )}
    </div>
  );
}
