import { useEffect, useState, type ReactNode } from "react";
import { closeWindow, isTauri, minimizeWindow, onMaximizedChange, toggleMaximizeWindow } from "@/lib/desktop";
import { cn } from "@/lib/utils";

/** A 10 px Windows-style caption glyph. */
const Glyph = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 10 10" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={1} aria-hidden>
    {children}
  </svg>
);

function Caption({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-full w-[46px] items-center justify-center text-ui-2 transition-colors",
        danger ? "hover:bg-[#c42b1c] hover:text-white" : "hover:bg-ui-hover hover:text-ui-1"
      )}
    >
      <Glyph>{children}</Glyph>
    </button>
  );
}

/**
 * Minimize, maximize / restore and close for the desktop app, whose window has no native frame:
 * the studio's top bar is its title bar. Renders nothing in a browser. Kiosk view's strip drops
 * Maximize (the window has an exact size there) and takes over Close.
 */
export function WindowControls({ maximize = true, onClose }: { maximize?: boolean; onClose?: () => void }) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    let off: (() => void) | undefined;
    let gone = false;
    void onMaximizedChange(setMaximized).then((unlisten) => (gone ? unlisten() : (off = unlisten)));
    return () => {
      gone = true;
      off?.();
    };
  }, []);
  if (!isTauri()) return null;
  return (
    <div className="ml-1 flex self-stretch">
      <Caption label="Minimize" onClick={() => void minimizeWindow()}>
        <path d="M0 5.5h10" />
      </Caption>
      {maximize && (
        <Caption label={maximized ? "Restore" : "Maximize"} onClick={() => void toggleMaximizeWindow()}>
          {maximized ? (
            <>
              <rect x={0.5} y={2.5} width={7} height={7} />
              <path d="M2.5 2.5V0.5h7v7h-2" />
            </>
          ) : (
            <rect x={0.5} y={0.5} width={9} height={9} />
          )}
        </Caption>
      )}
      <Caption label="Close" danger onClick={onClose ?? (() => void closeWindow())}>
        <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
      </Caption>
    </div>
  );
}
