/** A button that opens the file picker; `children` is the button's content. */
import { useRef, type ReactNode } from "react";
import { IMAGE_ACCEPT } from "./encode";

interface FilePickProps {
  children: ReactNode;
  className: string;
  multiple?: boolean;
  disabled?: boolean;
  title?: string;
  label?: string;
  onFiles: (files: File[]) => void;
}

export function FilePick({ children, className, multiple, disabled, title, label, onFiles }: FilePickProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" aria-label={label} title={title} disabled={disabled} onClick={() => input.current?.click()} className={className}>
        {children}
      </button>
      <input
        ref={input}
        type="file"
        multiple={multiple}
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          // Copied first: clearing the input empties its live FileList.
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}
