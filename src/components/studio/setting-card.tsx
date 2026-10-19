import type { ReactNode } from "react";
import { ChevronDown, RotateCcw, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInspectorChrome } from "./inspector-layout";

/** Attribute carrying a section's id (jump-to finds sections by it). */
export const SETTING_CARD = "data-setting-card";

interface SettingSectionProps {
  id: string;
  title: string;
  icon: LucideIcon;
  /** The tab the section is in (shown while filtering: results come from every tab). */
  tabLabel?: string;
  /** Own values in the section; 0 hides the count and the reset. */
  changed: number;
  /** After the title (a followable section's Theme / Custom / Locked pill). */
  pill?: ReactNode;
  /** Header controls before the reset (the style tools). */
  actions?: ReactNode;
  /** Drop just this section's own values. */
  onReset?: () => void;
  open: boolean;
  onToggle: () => void;
  /** A search or the Changed filter is on: always open, no chevron. */
  filtering?: boolean;
  /** Marks the section the studio scrolls into view when a panel widget is selected. */
  editor?: boolean;
  /** Briefly outline the section (it was just jumped to). */
  flash?: boolean;
  children: ReactNode;
}

/**
 * An inspector section: an accordion header that stays at the top while
 * its fields scroll (icon, title, the tab while filtering, a count of own
 * values and the chevron), a reset of just this section beside it, then
 * the field rows when open. One column, so collapsing never reflows sideways.
 */
export function SettingSection({
  id,
  title,
  icon: Icon,
  tabLabel,
  changed,
  pill,
  actions,
  onReset,
  open,
  onToggle,
  filtering = false,
  editor = false,
  flash = false,
  children,
}: SettingSectionProps) {
  const sheet = useInspectorChrome().mode === "sheet";
  const shown = filtering || open;
  return (
    <section
      {...{ [SETTING_CARD]: id }}
      data-widget-editor={editor ? "" : undefined}
      className={cn("border-b border-[#1c1c21] transition-shadow duration-500", flash && "shadow-[inset_0_0_0_1.5px_var(--ui-accent)]")}
    >
      <header className="sticky top-0 z-[1] flex items-center gap-0.5 bg-ui-panel px-2">
        <button
          type="button"
          aria-expanded={shown}
          disabled={filtering}
          onClick={onToggle}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-[7px] px-2 text-left text-ui-1 enabled:hover:bg-[#16161a]",
            sheet ? "h-12" : "h-[42px]"
          )}
        >
          <Icon className="h-[17px] w-[17px] shrink-0 text-[#7c7c86]" strokeWidth={1.75} />
          <span className="truncate text-[12.5px] font-semibold">{title}</span>
          {filtering && tabLabel && <span className="shrink-0 whitespace-nowrap text-[11px] text-ui-5">{tabLabel}</span>}
          {pill}
          {changed > 0 && (
            <span className="shrink-0 rounded-lg bg-ui-accent/[.18] px-[5px] py-px font-ui-mono text-[10px] text-ui-accent-text">
              {changed}
            </span>
          )}
          {!filtering && (
            <ChevronDown
              className={cn("ml-auto h-[18px] w-[18px] shrink-0 text-ui-5 transition-transform duration-150", open && "rotate-180")}
            />
          )}
        </button>
        {/* The style tools only while open: a closed header keeps its title. */}
        {shown && actions}
        {changed > 0 && onReset && (
          <button
            type="button"
            onClick={onReset}
            title={`Reset ${title}`}
            aria-label={`Reset ${title}`}
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] text-ui-3 hover:bg-[#1e1e23] hover:text-ui-1"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
      </header>
      {shown && <div className="pb-2.5">{children}</div>}
    </section>
  );
}
