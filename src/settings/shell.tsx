import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Activity, Bot, CircleArrowDown, CircleCheck, History, Info, LayoutDashboard, Minus, RotateCcw, ScrollText, Search, Server, SlidersHorizontal, Square, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { displayAddress, serverCard } from "./model/cards";
import { restartText } from "./model/restart";
import { SECTION_NAMES, searchSettings, type SectionId } from "./model/search";
import { useStore } from "./store";
import { Kbd, tone } from "./ui";

/** The sections' sidebar icons (the spec names Material ones; these are lucide's closest). */
export const SECTION_ICONS: Record<SectionId, LucideIcon> = {
  general: SlidersHorizontal,
  server: Server,
  agents: Bot,
  updates: CircleArrowDown,
  diagnostics: Activity,
  logs: ScrollText,
  about: Info,
  changelog: History,
};

const NAV_GROUPS: { label: string; items: SectionId[] }[] = [
  { label: "App", items: ["general", "server", "agents", "updates"] },
  { label: "Troubleshoot", items: ["diagnostics", "logs"] },
  { label: "InfoPanel Studio", items: ["about", "changelog"] },
];

/** The 36px title bar: the window has no native frame, so it carries the drag region and the caption buttons. */
export function TitleBar() {
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
      <div data-tauri-drag-region className="grid h-[18px] w-[18px] place-items-center rounded-[5px] bg-s-accent text-s-win">
        <LayoutDashboard className="pointer-events-none h-[13px] w-[13px]" strokeWidth={2.5} />
      </div>
      <div data-tauri-drag-region className="text-xs font-medium text-s-t2">
        InfoPanel Studio — Settings
      </div>
      <div data-tauri-drag-region className="flex-1" />
      <div className="flex h-full">
        <button type="button" aria-label="Minimize" title="Minimize" className={caption} onClick={() => void win().minimize()}>
          <Minus className="h-4 w-4" />
        </button>
        <button type="button" aria-label={maximized ? "Restore" : "Maximize"} title={maximized ? "Restore" : "Maximize"} className={caption} onClick={() => void win().toggleMaximize()}>
          <Square className="h-3 w-3" />
        </button>
        <button type="button" aria-label="Close" title="Close" className={cn(caption, "hover:bg-[#c42b1c] hover:text-white")} onClick={() => void win().close()}>
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** The nav: groups with indicators, or the search results. */
export function Sidebar() {
  const { section, go, status, settings, update, lanIp } = useStore();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = searchSettings(query);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const open = (i: number) => {
    const hit = results[i];
    if (!hit) return;
    setQuery("");
    go(hit.section, hit.row);
  };
  const card = serverCard(status, lanIp);
  const t = tone(card.tone);
  const updateBadge = update.state === "available" || update.state === "ready";

  return (
    <aside className="flex w-[236px] shrink-0 flex-col border-r border-s-side-line bg-s-side">
      <div className="px-3 pb-2.5 pt-3.5">
        <div className="flex h-[34px] items-center gap-2 rounded-[9px] border border-s-track-line bg-[#141418] px-2.5">
          <Search className="h-[17px] w-[17px] shrink-0 text-s-dim" />
          <input
            ref={input}
            value={query}
            placeholder="Search settings"
            aria-label="Search settings"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
              else if (e.key === "ArrowDown" && results.length) setActive((a) => Math.min(results.length - 1, a + 1));
              else if (e.key === "ArrowUp" && results.length) setActive((a) => Math.max(0, a - 1));
              else if (e.key === "Enter") open(active);
              else return;
              e.preventDefault();
            }}
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-s-t1 outline-none placeholder:text-s-dim"
          />
          {query ? (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="grid cursor-pointer border-0 bg-transparent p-0 text-s-dim hover:text-s-t1">
              <X className="h-4 w-4" />
            </button>
          ) : (
            <Kbd>Ctrl K</Kbd>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-2 pb-3 pt-1">
        {query ? (
          <>
            <div className="px-2.5 pb-1.5 pt-2 text-[10.5px] uppercase tracking-[0.07em] text-s-faint">{results.length === 0 ? "No matches" : `${results.length} result${results.length === 1 ? "" : "s"}`}</div>
            {results.map((r, i) => {
              const Icon = SECTION_ICONS[r.section];
              return (
                <button
                  key={`${r.row}-${r.label}`}
                  type="button"
                  onClick={() => open(i)}
                  className={cn("flex w-full cursor-pointer flex-col gap-0.5 rounded-lg border-0 px-2.5 py-2 text-left text-s-t1 hover:bg-s-nav-hover", i === active ? "bg-s-nav-hover" : "bg-transparent")}
                >
                  <span className="text-[13px]">{r.label}</span>
                  <span className="flex items-center gap-1 text-[11.5px] text-s-dim">
                    <Icon className="h-[13px] w-[13px]" />
                    {SECTION_NAMES[r.section]}
                  </span>
                </button>
              );
            })}
          </>
        ) : (
          <nav aria-label="Settings sections" className="contents">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="contents">
                <div className="px-2.5 pb-1.5 pt-3 text-[10.5px] font-medium uppercase tracking-[0.07em] text-s-faint">{group.label}</div>
                {group.items.map((id) => {
                  const Icon = SECTION_ICONS[id];
                  const on = section === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-current={on ? "page" : undefined}
                      onClick={() => go(id)}
                      className={cn(
                        "flex h-[34px] w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 px-2.5 text-left text-[13px] font-medium",
                        on ? "bg-s-nav-on text-s-t1" : "bg-transparent text-s-t2 hover:bg-s-nav-hover"
                      )}
                    >
                      <Icon className={cn("h-[18px] w-[18px]", on ? "text-s-accent-text" : "text-s-dim")} />
                      <span className="flex-1">{SECTION_NAMES[id]}</span>
                      {id === "server" && <span className={cn("h-[7px] w-[7px] rounded-full", t.dot)} />}
                      {id === "diagnostics" && settings.debug && <span className="h-[7px] w-[7px] rounded-full bg-s-amber" />}
                      {id === "updates" && updateBadge && <span className="rounded-full bg-s-accent/18 px-1.5 py-px text-[10.5px] font-semibold text-s-accent-text">1</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        )}
      </div>

      <div className="flex items-center gap-2.5 border-t border-s-side-line px-3.5 py-3">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", t.dot, t.halo)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-medium text-s-t2">{card.title.replace("…", "")}</span>
          <span className="truncate font-mono text-[11px] text-s-dim">{status.state === "running" ? displayAddress(status.host, status.port, lanIp) : stateWord(status.state)}</span>
        </div>
        <span className="text-[11px] text-s-faint">v{status.appVersion}</span>
      </div>
    </aside>
  );
}

function stateWord(state: string): string {
  return { stopped: "stopped", starting: "starting", restarting: "restarting" }[state] ?? "error";
}

/** The sticky amber bar: saved settings the running server hasn't picked up (SPEC 2.2). */
export function RestartBar() {
  const { barVisible, pending, undoRestart, restartServer } = useStore();
  if (!barVisible) return null;
  return (
    <div role="status" className="sticky top-0 z-[4] flex items-center gap-3 border-b border-s-bar-line bg-s-bar-bg px-7 py-2.5">
      <RotateCcw className="h-[18px] w-[18px] shrink-0 text-s-bar-button" />
      <span className="flex-1 text-[13px] text-s-bar-text">{restartText(pending)}</span>
      <button type="button" onClick={() => void undoRestart()} className="h-[30px] cursor-pointer rounded-[7px] border border-[oklch(0.45_0.08_75)] bg-transparent px-3 text-[12.5px] text-s-bar-text">
        Undo
      </button>
      <button type="button" onClick={() => void restartServer()} className="h-[30px] cursor-pointer rounded-[7px] border-0 bg-s-bar-button px-3 text-[12.5px] font-semibold text-[#1a1405]">
        Restart server
      </button>
    </div>
  );
}

/** The "Saved" toast, bottom right. */
export function ToastView() {
  const { toastState } = useStore();
  if (!toastState) return null;
  return (
    <div
      key={toastState.id}
      role="status"
      className="fixed bottom-5 right-6 z-10 flex h-[34px] items-center gap-2 rounded-[9px] border border-s-input-line bg-[#1c1c21] px-3.5 text-[12.5px] text-s-t1 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
    >
      {toastState.error ? <X className="h-4 w-4 text-s-red" /> : <CircleCheck className="h-4 w-4 text-s-green" />}
      {toastState.message}
    </div>
  );
}
