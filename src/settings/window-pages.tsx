import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { CircleCheck, X } from "lucide-react";
import { SettingsDashboard } from "@/components/studio/settings-dashboard";
import { SettingsStudio } from "@/components/studio/settings-studio";
import { focusNavTarget } from "@/components/studio/studio-nav";
import { isTauri, showStudio } from "@/lib/desktop";
import { postStudioMessage } from "@/lib/studio-channel";
import { cn } from "@/lib/utils";
import { useDashboardSettings, type SaveNote } from "./use-dashboard-settings";

/** How long "Saved" stays up, and an error. */
const SAVED_MS = 1400;
const ERROR_MS = 4500;

/** "Saved", or why not, bottom right (the App pages' toast, for the Dashboard page's changes). */
function NoteToast({ note }: { note?: SaveNote }) {
  const [shown, setShown] = useState<SaveNote>();
  useEffect(() => {
    if (!note) return;
    setShown(note);
    const timer = setTimeout(() => setShown(undefined), note.error ? ERROR_MS : SAVED_MS);
    return () => clearTimeout(timer);
  }, [note]);
  if (!shown) return null;
  return (
    <div
      key={shown.id}
      role="status"
      className="fixed bottom-5 right-6 z-10 flex h-(--ui-h-field) items-center gap-2 rounded-ui-menu border border-s-input-line bg-s-divider px-3.5 text-[12.5px] text-s-t1 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
    >
      {shown.error ? <X className="h-4 w-4 text-s-red" /> : <CircleCheck className="h-4 w-4 text-s-green" />}
      {shown.error ?? "Saved"}
    </div>
  );
}

/** Screens at a screen, in the Studio window (which the desktop app brings to the front). */
function openScreen(profileId: string) {
  postStudioMessage({ type: "open", target: { view: "screens", profileId, section: "performance" } });
  if (isTauri()) void showStudio().catch(() => {});
  else (window.opener as Window | null)?.focus();
}

/** Settings › Dashboard: every screen and kiosk, saved on the server as it changes (PLAN decision 22). */
function DashboardPage() {
  const { config, loadError, note, patch, reset, exportFile } = useDashboardSettings();
  return (
    <div className="flex max-w-[560px] flex-col">
      {loadError && <p className="m-0 mb-4 rounded-lg border border-s-card-line bg-s-card px-3.5 py-2.5 text-[12.5px] text-s-t2">{loadError}</p>}
      {config && <SettingsDashboard config={config} onPatch={patch} onExport={() => void exportFile()} onReset={reset} onOpenScreen={openScreen} />}
      <NoteToast note={note} />
    </div>
  );
}

function StudioPage() {
  return (
    <div className="max-w-[560px]">
      <SettingsStudio />
    </div>
  );
}

export interface WindowPage {
  subtitle: string;
  wide?: boolean;
  Section: ComponentType;
}

/** The pages the Settings window has on the Studio's server, in the desktop app and in a browser alike. */
export const PREFERENCE_PAGES: Record<"dashboard" | "studio", WindowPage> = {
  dashboard: { subtitle: "Every screen and kiosk. A change is saved and shows on the kiosks at once.", Section: DashboardPage },
  studio: { subtitle: "Editor preferences, saved with the Studio on this device.", Section: StudioPage },
};

/** How long a jump to a group waits for its page to render it (the Dashboard page reads the config first). */
const FOCUS_FRAMES = 120;

interface WindowMainProps {
  title: string;
  subtitle: string;
  wide?: boolean;
  /** A group to scroll to and focus (`data-nav-section`); `n` makes a repeat count. */
  focus?: { row: string; n: number } | null;
  /** Above the page, sticky (the restart bar). */
  top?: ReactNode;
  children: ReactNode;
}

/** A Settings window page: its title and subtitle over the page, in the 780 px column (1040 px when wide). */
export function WindowMain({ title, subtitle, wide, focus, top, children }: WindowMainProps) {
  const main = useRef<HTMLElement>(null);
  // A new page starts at the top (a jump scrolls to its group after this).
  useLayoutEffect(() => {
    main.current?.scrollTo?.({ top: 0 });
  }, [title]);
  useEffect(() => {
    const root = main.current;
    if (!focus || !root) return;
    let frames = 0;
    let id = requestAnimationFrame(function attempt() {
      if (focusNavTarget(root, { view: "settings", section: focus.row }) || ++frames >= FOCUS_FRAMES) return;
      id = requestAnimationFrame(attempt);
    });
    return () => cancelAnimationFrame(id);
  }, [focus?.row, focus?.n, title]);
  return (
    <main ref={main} data-scroll-root className="relative min-w-0 flex-1 scroll-pt-16 overflow-auto">
      {top}
      <div className={cn("mx-auto flex w-full min-w-0 flex-col gap-7 px-8 pb-20 pt-8 max-sm:px-4", wide ? "max-w-[1040px]" : "max-w-[780px]")}>
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-2xl font-semibold tracking-[-0.015em]">{title}</h1>
          <p className="m-0 text-pretty text-[13.5px] leading-normal text-s-muted">{subtitle}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
