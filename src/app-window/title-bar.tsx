import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { StudioLogo } from "@/components/studio/studio-logo";
import { cn } from "@/lib/utils";

/** Two overlapping squares: what Restore looks like on Windows (Lucide has no such glyph). */
function Restore() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
      <rect x="1.75" y="3.75" width="6.5" height="6.5" rx="1" />
      <path d="M3.75 3.75V3a1.25 1.25 0 0 1 1.25-1.25h4A1.25 1.25 0 0 1 10.25 3v4A1.25 1.25 0 0 1 9 8.25h-.75" />
    </svg>
  );
}

/** The 36px title bar: the window has no native frame, so it carries the drag region and the caption buttons. */
export function TitleBar({ title }: { title: string }) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const win = getCurrentWindow();
    const sync = () => void win.isMaximized().then(setMaximized).catch(() => {});
    sync();
    const off = win.onResized(sync);
    return () => void off.then((u) => u()).catch(() => {});
  }, []);
  const win = () => getCurrentWindow();
  const caption = "grid h-full w-[46px] place-items-center border-0 bg-transparent text-s-muted transition-colors hover:bg-s-nav-hover hover:text-s-t1";
  return (
    <div data-tauri-drag-region className="flex h-9 shrink-0 select-none items-center gap-2.5 border-b border-s-side-line bg-s-side pl-3">
      <div data-tauri-drag-region className="grid h-[18px] w-[18px] place-items-center">
        <StudioLogo className="pointer-events-none h-[18px] w-[18px]" />
      </div>
      <div data-tauri-drag-region className="text-xs font-medium text-s-t2">
        {title}
      </div>
      <div data-tauri-drag-region className="flex-1" />
      <div className="flex h-full">
        <button type="button" aria-label="Minimize" title="Minimize" className={caption} onClick={() => void win().minimize()}>
          <Minus className="h-4 w-4" />
        </button>
        <button type="button" aria-label={maximized ? "Restore" : "Maximize"} title={maximized ? "Restore" : "Maximize"} className={caption} onClick={() => void win().toggleMaximize()}>
          {maximized ? <Restore /> : <Square className="h-3 w-3" />}
        </button>
        <button type="button" aria-label="Close" title="Close" className={cn(caption, "hover:bg-[#c42b1c] hover:text-white")} onClick={() => void win().close()}>
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
