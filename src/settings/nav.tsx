import type { ReactNode } from "react";
import { Activity, Bot, CircleArrowDown, Hand, History, Info, MonitorCog, PencilRuler, Plug, ScrollText, Server, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAGE_NAMES, type PageId } from "./model/search";

/** The pages' sidebar icons (the spec names Material ones; these are lucide's closest). */
export const PAGE_ICONS: Record<PageId, LucideIcon> = {
  general: SlidersHorizontal,
  server: Server,
  connections: Plug,
  agents: Bot,
  touch: Hand,
  updates: CircleArrowDown,
  diagnostics: Activity,
  logs: ScrollText,
  about: Info,
  changelog: History,
  dashboard: MonitorCog,
  studio: PencilRuler,
};

export interface NavGroup {
  label: string;
  items: PageId[];
}

export function NavGroupLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pb-1.5 pt-3 text-[10.5px] font-medium uppercase tracking-[0.07em] text-s-dim">{children}</div>;
}

/** A page in the sidebar; `children` are its indicators (a status dot, a count). */
export function NavItem({ id, on, onClick, children }: { id: PageId; on: boolean; onClick: () => void; children?: ReactNode }) {
  const Icon = PAGE_ICONS[id];
  return (
    <button
      type="button"
      aria-current={on ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "flex h-[34px] w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 px-2.5 text-left text-[13px] font-medium",
        on ? "bg-s-nav-on text-s-t1" : "bg-transparent text-s-t2 hover:bg-s-nav-hover"
      )}
    >
      <Icon className={cn("h-[18px] w-[18px]", on ? "text-s-accent-text" : "text-s-dim")} />
      <span className="flex-1">{PAGE_NAMES[id]}</span>
      {children}
    </button>
  );
}
