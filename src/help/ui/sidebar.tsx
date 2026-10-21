import type { KeyboardEvent, RefObject } from "react";
import { useState } from "react";
import { House, Rocket, Settings } from "lucide-react";
import { SearchBox, useSearchShortcut } from "@/app-window/search-box";
import { requestSetup } from "@/lib/setup-request";
import { cn } from "@/lib/utils";
import { useEnv } from "../env";
import { iconFor } from "../icons";
import type { HelpContent } from "../types";
import { SoonChip } from "./article-view";

interface SidebarProps {
  content: HelpContent;
  inputRef: RefObject<HTMLInputElement | null>;
  /** The open article, or null for Help home. */
  current: string | null;
  query: string;
  version: string | null;
  onQuery: (query: string) => void;
  onSubmit: () => void;
  onHome: () => void;
  onOpen: (article: string) => void;
}

const ITEM = "flex w-full flex-none cursor-pointer items-center gap-2.5 whitespace-normal rounded-lg border-0 px-2.5 text-left text-[13px] font-medium";

/** The 248px sidebar: search, Help home, the nav groups, and the footer with Run setup again, Open Settings and the version. */
export function Sidebar({ content, inputRef, current, query, version, onQuery, onSubmit, onHome, onOpen }: SidebarProps) {
  const env = useEnv();
  const [asked, setAsked] = useState(false);
  useSearchShortcut(inputRef);
  const searching = query.trim() !== "";
  const home = current === null && !searching;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") onQuery("");
    else if (e.key === "Enter") onSubmit();
    else return;
    e.preventDefault();
  };

  return (
    <aside className="flex min-h-0 w-[248px] shrink-0 flex-col border-r border-s-side-line bg-s-side">
      <div role="search" className="px-3 pb-1.5 pt-3.5">
        <SearchBox inputRef={inputRef} value={query} label="Search help" onChange={onQuery} onKeyDown={onKeyDown} />
      </div>
      <nav aria-label="Help topics" className="flex min-h-0 flex-1 flex-col gap-px overflow-auto px-2 pb-3 pt-1">
        <button type="button" aria-current={home ? "page" : undefined} onClick={onHome} className={cn(ITEM, "h-[34px]", home ? "bg-s-nav-on text-s-t1" : "bg-transparent text-[#a8a8b2] hover:bg-s-nav-hover")}>
          <House className={cn("h-[18px] w-[18px]", home ? "text-s-accent-text" : "text-s-dim")} />
          <span className="flex-1">Help home</span>
        </button>
        {content.groups.map((group) => (
          <div key={group.label} className="contents">
            <div className="px-2.5 pb-[5px] pt-3.5 text-[10.5px] font-medium uppercase tracking-[0.07em] text-s-faint">{group.label}</div>
            {group.articles.map((a) => {
              const on = current === a.id && !searching;
              const Icon = iconFor(a.icon);
              return (
                <button key={a.id} type="button" aria-current={on ? "page" : undefined} onClick={() => onOpen(a.id)} className={cn(ITEM, "min-h-8", on ? "bg-s-nav-on text-s-t1" : "bg-transparent text-[#a8a8b2] hover:bg-s-nav-hover")}>
                  <Icon className={cn("h-[17px] w-[17px] flex-none", on ? "text-s-accent-text" : "text-s-dim")} />
                  <span className="flex-1">{a.title}</span>
                  {a.status === "coming-soon" && <SoonChip />}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="flex flex-col gap-2 border-t border-s-side-line px-3.5 py-3">
        <button
          type="button"
          onClick={() => {
            requestSetup();
            setAsked(true);
          }}
          className="flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-[12.5px] text-s-t2 hover:text-s-t1"
        >
          <Rocket className="h-[17px] w-[17px] text-s-dim" />
          Run setup again
        </button>
        {asked && <span role="status" className="text-[11px] text-s-faint">The setup opens in Studio.</span>}
        {env.desktop && (
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => env.openSettings("general")} className="flex flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-[12.5px] text-s-t2 hover:text-s-t1">
              <Settings className="h-[17px] w-[17px] text-s-dim" />
              Open Settings
            </button>
            {version && <span className="text-[11px] text-s-faint">v{version}</span>}
          </div>
        )}
      </div>
    </aside>
  );
}
