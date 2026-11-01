import { useRef, useState } from "react";
import { CircleCheck, CircleHelp, ExternalLink, RotateCcw, X } from "lucide-react";
import { SearchBox, useSearchShortcut } from "@/app-window/search-box";
import { TitleBar as WindowTitleBar } from "@/app-window/title-bar";
import { cn } from "@/lib/utils";
import { settingsHelpTarget } from "@/help/context";
import { errorText, ipc } from "./ipc";
import { RELEASES_URL } from "./model/changelog";
import { displayAddress, serverCard } from "./model/cards";
import { restartText } from "./model/restart";
import { PAGE_NAMES, searchSettings, type PageId, type SearchEntry } from "./model/search";
import { NavGroupLabel, NavItem, PAGE_ICONS, type NavGroup } from "./nav";
import { useStore } from "./store";
import { tone } from "./ui";

/** The rescue window's groups (app/settings.html): the App sections only. */
const NAV_GROUPS: NavGroup[] = [
  { label: "App", items: ["general", "server", "agents", "touch", "updates"] },
  { label: "Troubleshoot", items: ["diagnostics", "logs"] },
  { label: "InfoPanel Studio", items: ["about", "changelog"] },
];

export function TitleBar() {
  return <WindowTitleBar title="InfoPanel Studio — Settings" />;
}

interface SidebarProps {
  groups?: NavGroup[];
  /** What search finds (the App sections' rows by default). */
  index?: SearchEntry<PageId>[];
}

/** The nav: groups with indicators, or the search results. */
export function Sidebar({ groups = NAV_GROUPS, index }: SidebarProps) {
  const { section, go, status, settings, update, lanIp, toast } = useStore();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = searchSettings<PageId>(query, index);

  useSearchShortcut(input);

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
        <SearchBox
          inputRef={input}
          value={query}
          label="Search settings"
          list={{ id: "settings-results", activeId: results.length ? `settings-result-${Math.min(active, results.length - 1)}` : undefined }}
          onChange={(value) => {
            setQuery(value);
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
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-2 pb-3 pt-1">
        {query ? (
          <>
            <div role="status" className="px-2.5 pb-1.5 pt-2 text-[10.5px] uppercase tracking-[0.07em] text-s-dim">{results.length === 0 ? "No matches" : `${results.length} result${results.length === 1 ? "" : "s"}`}</div>
            <div id="settings-results" role="listbox" aria-label="Settings search results" className="contents">
            {results.map((r, i) => {
              const Icon = PAGE_ICONS[r.section];
              return (
                <button
                  key={`${r.row}-${r.label}`}
                  id={`settings-result-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  tabIndex={-1}
                  onClick={() => open(i)}
                  className={cn("flex w-full cursor-pointer flex-col gap-0.5 rounded-lg border-0 px-2.5 py-2 text-left text-s-t1 hover:bg-s-nav-hover", i === active ? "bg-s-nav-hover outline outline-2 -outline-offset-2 outline-s-accent" : "bg-transparent")}
                >
                  <span className="text-[13px]">{r.label}</span>
                  <span className="flex items-center gap-1 text-[11.5px] text-s-dim">
                    <Icon className="h-[13px] w-[13px]" />
                    {PAGE_NAMES[r.section]}
                  </span>
                </button>
              );
            })}
            </div>
          </>
        ) : (
          <nav aria-label="Settings sections" className="contents">
            {groups.map((group) => (
              <div key={group.label} className="contents">
                <NavGroupLabel>{group.label}</NavGroupLabel>
                {group.items.map((id) => (
                  <NavItem
                    key={id}
                    id={id}
                    on={section === id}
                    onClick={() => go(id)}
                    status={id === "server" ? card.title : id === "diagnostics" && settings.debug ? "Debug is on" : id === "updates" && updateBadge ? "Update available" : undefined}
                  >
                    {id === "server" && <span aria-hidden="true" className={cn("h-[7px] w-[7px] rounded-full", t.dot)} />}
                    {id === "diagnostics" && settings.debug && <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-s-amber" />}
                    {id === "updates" && updateBadge && (
                      <span aria-hidden="true" className="rounded-full bg-s-accent/18 px-1.5 py-px text-[10.5px] font-semibold text-s-accent-text">
                        1
                      </span>
                    )}
                  </NavItem>
                ))}
              </div>
            ))}
            {/* The system browser opens it, as every link in the Settings window does. */}
            <a
              href={RELEASES_URL}
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault();
                void ipc.openExternal(RELEASES_URL).catch((err) => toast(errorText(err), true));
              }}
              className="flex h-[34px] w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-s-t2 no-underline hover:bg-s-nav-hover"
            >
              <ExternalLink className="h-[18px] w-[18px] text-s-dim" />
              <span className="flex-1">Releases on GitHub</span>
            </a>
          </nav>
        )}
      </div>

      <div className="flex items-center gap-2.5 border-t border-s-side-line px-3.5 py-3">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", t.dot, t.halo)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-medium text-s-t2">{card.title.replace("…", "")}</span>
          <span className="truncate font-mono text-[11px] text-s-dim">{status.state === "running" ? displayAddress(status.host, status.port, lanIp) : stateWord(status.state)}</span>
        </div>
        <button
          type="button"
          title="Help (F1)"
          onClick={() => void ipc.openHelp(settingsHelpTarget(section)).catch((e) => toast(errorText(e), true))}
          className="flex h-6 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-1.5 text-[11.5px] text-s-muted hover:bg-s-nav-hover hover:text-s-t1"
        >
          <CircleHelp className="h-[14px] w-[14px]" />
          Help
        </button>
        <span className="text-[11px] text-s-dim">v{status.appVersion}</span>
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
