import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { DialogParts } from "@/components/ui/dialog";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { collapseNumbered, launcherCommands, parseRecentCommands, RECENT_COMMANDS_KEY, withRecentCommand } from "./command-launcher";
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
  const searching = query.trim() !== "";
  // Empty: Recent, Actions and Go to. Typing searches everything, settings included.
  const [recent] = useState(() => {
    try {
      return parseRecentCommands(localStorage.getItem(RECENT_COMMANDS_KEY));
    } catch {
      return [];
    }
  });
  const launcher = searching ? [] : launcherCommands(commands, recent);
  // A command list with none of the launcher's entries (a bare one) shows whole.
  const results = searching ? collapseNumbered(rankCommands(commands, query)) : launcher.length > 0 ? launcher : commands;
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
          role="combobox"
          aria-expanded={results.length > 0}
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
          <div key={`${command.group}:${command.id}`}>
            {!searching && command.group !== results[i - 1]?.group && (
              <div className="px-2 pb-1 pt-2 text-caption font-medium text-ui-3">
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
      <div className="flex shrink-0 items-center gap-3 border-t border-ui-subtle px-3 py-1.5 font-ui-mono text-micro text-ui-hint">
        <span>Enter run</span>
        <span>↑↓ move</span>
        <span>Esc close</span>
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
    <DialogParts.Root open={open} onOpenChange={onOpenChange}>
      <DialogParts.Content
        layout="panel"
        ref={popupRef}
        initialFocus={() => popupRef.current?.querySelector("input") ?? true}
        className="top-[15vh] translate-y-0 flex max-h-[60vh] w-[min(32rem,calc(100vw-2rem))] flex-col rounded-xl bg-ui-raised"
      >
        <DialogParts.Title className="sr-only">Command palette</DialogParts.Title>
        {open && (
          <PaletteBody
            commands={commands}
            onRun={(command) => {
              try {
                const stored = parseRecentCommands(localStorage.getItem(RECENT_COMMANDS_KEY));
                localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(withRecentCommand(stored, command.id)));
              } catch {
                // Storage unavailable: Recent just stays as it was.
              }
              onOpenChange(false);
              onRun(command);
            }}
          />
        )}
      </DialogParts.Content>
    </DialogParts.Root>
  );
}
