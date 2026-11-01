import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { rankCommands, type Command } from "./commands";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: Command[];
  /** Run a command (the palette closes first). */
  onRun: (command: Command) => void;
}

/** Search box and the ranked list; remounts (resets) on every open. */
function PaletteBody({ commands, onRun }: Pick<CommandPaletteProps, "commands" | "onRun">) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const results = rankCommands(commands, query);
  const searching = query.trim() !== "";
  const current = Math.min(active, results.length - 1);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${current}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((results.length + current + step) % Math.max(1, results.length));
    } else if (e.key === "Enter" && results[current]) {
      e.preventDefault();
      onRun(results[current]);
    }
  };

  return (
    <>
      <div className="relative border-b border-ui-subtle">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ui-4" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Type a command or search…"
          aria-label="Command"
          aria-controls="command-results"
          aria-autocomplete="list"
          aria-activedescendant={results.length ? `command-option-${current}` : undefined}
          className="w-full bg-transparent py-2.5 pl-9 pr-3 text-sm text-ui-1 outline-none placeholder:text-ui-4"
        />
      </div>
      <div ref={listRef} id="command-results" role="listbox" aria-label="Commands" className="min-h-0 flex-1 overflow-y-auto p-1">
        {results.length === 0 && (
          <div role="status" className="py-6 text-center text-xs text-ui-4">
            No commands match
          </div>
        )}
        {results.map((command, i) => (
          <div key={command.id}>
            {!searching && command.group !== results[i - 1]?.group && (
              <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-ui-4">
                {command.group}
              </div>
            )}
            <div
              id={`command-option-${i}`}
              role="option"
              aria-selected={i === current}
              data-index={i}
              onMouseMove={() => setActive(i)}
              onClick={() => onRun(command)}
              className={cn(
                "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                i === current ? "bg-ui-hover text-ui-1" : "text-ui-2"
              )}
            >
              <span className="min-w-0 flex-1 truncate">{command.label}</span>
              {command.hint && (
                <span className="shrink-0 font-ui-mono text-micro text-ui-4">{command.hint}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Ctrl+K: every studio action by name — add a widget, switch profile,
 * select a zone, jump to a setting. Arrows + Enter run, Esc closes.
 */
export function CommandPalette({ open, onOpenChange, commands, onRun }: CommandPaletteProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Popup
          ref={popupRef}
          initialFocus={() => popupRef.current?.querySelector("input") ?? true}
          className="fixed left-1/2 top-[15vh] z-50 flex max-h-[60vh] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 flex-col rounded-xl border border-ui-strong bg-ui-raised font-ui text-ui-1 shadow-ui-modal outline-none"
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          {open && (
            <PaletteBody
              commands={commands}
              onRun={(command) => {
                onOpenChange(false);
                onRun(command);
              }}
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
