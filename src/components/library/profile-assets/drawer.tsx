/** The right-hand drawer of the Profile assets tab (440 px): a title, a scrolling body and a footer. */
import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useFocusReturn } from "@/hooks/use-focus-return";

export function Drawer({ title, onClose, footer, children }: { title: string; onClose: () => void; footer: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useFocusReturn(ref);
  return (
    <aside
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label={title}
      onKeyDown={(e) => e.key === "Escape" && !e.defaultPrevented && e.currentTarget.contains(e.target as Node) && onClose()}
      className="absolute inset-y-0 right-0 z-20 flex w-[440px] outline-none max-w-full flex-col border-l border-ui-default bg-ui-panel font-ui shadow-[-12px_0_32px_rgba(0,0,0,.35)]"
    >
      <header className="flex h-[48px] shrink-0 items-center justify-between border-b border-ui-subtle px-4">
        <h2 className="text-[14px] font-semibold text-ui-1">{title}</h2>
        <button type="button" aria-label="Close" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-ui-4 hover:text-ui-1">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      <footer className="flex shrink-0 items-center gap-3 border-t border-ui-subtle px-4 py-3">{footer}</footer>
    </aside>
  );
}

export const BUTTON = "flex h-[34px] items-center gap-1.5 rounded-[8px] border border-ui-default px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover disabled:pointer-events-none disabled:opacity-40";
export const PRIMARY = "flex h-[34px] items-center gap-1.5 rounded-[8px] bg-ui-inverse px-3 text-[12.5px] font-medium text-ui-inverse-fg hover:opacity-90 disabled:pointer-events-none disabled:opacity-40";
