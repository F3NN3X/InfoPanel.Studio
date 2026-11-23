import { useEffect, useLayoutEffect, useRef, type ComponentType, type ReactNode } from "react";
import { useToast } from "@/components/ui/toast";
import { SettingsDashboard } from "@/components/studio/settings-dashboard";
import { SettingsStudio } from "@/components/studio/settings-studio";
import { focusNavTarget } from "@/components/studio/studio-nav";
import { isTauri, showStudio } from "@/lib/desktop";
import { postStudioMessage } from "@/lib/studio-channel";
import { PageColumn } from "./parts";
import { useDashboardSettings, type SaveNote } from "./use-dashboard-settings";

/** "Saved", or why not, for the Dashboard page's changes (the App pages' toast). */
function NoteToast({ note }: { note?: SaveNote }) {
  const toast = useToast();
  useEffect(() => {
    if (note) toast(note.error ?? "Saved", { error: !!note.error });
  }, [note, toast]);
  return null;
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
    <div className="flex flex-col gap-7">
      {loadError && <p className="m-0 mb-4 rounded-lg border border-s-card-line bg-s-card px-3.5 py-2.5 text-caption text-s-t2">{loadError}</p>}
      {config && <SettingsDashboard config={config} onPatch={patch} onExport={() => void exportFile()} onReset={reset} onOpenScreen={openScreen} />}
      <NoteToast note={note} />
    </div>
  );
}

function StudioPage() {
  return <SettingsStudio />;
}

export interface WindowPage {
  subtitle: string;
  wide?: boolean;
  Section: ComponentType;
}

/** The pages the Settings window has on the Studio's server, in the desktop app and in a browser alike. */
export const PREFERENCE_PAGES: Record<"dashboard" | "studio", WindowPage> = {
  dashboard: { subtitle: "Defaults for the app and every kiosk. A change is saved and shows on the kiosks at once.", Section: DashboardPage },
  studio: { subtitle: "Editor preferences, saved with the Studio on this device, not in your dashboard.", Section: StudioPage },
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

/** A Settings window page: its title and subtitle over the page (`PageColumn`). */
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
      <PageColumn title={title} subtitle={subtitle} wide={wide}>
        {children}
      </PageColumn>
    </main>
  );
}
