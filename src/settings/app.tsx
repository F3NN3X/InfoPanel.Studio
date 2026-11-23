import { useLayoutEffect, useRef } from "react";
import { ToastProvider } from "@/components/ui/toast-provider";
import { useZoomKeys } from "@/app-window/zoom";
import { useHelpKey } from "@/help/use-help-key";
import { settingsHelpTarget } from "@/help/context";
import { isSectionId, SECTION_NAMES } from "./model/search";
import { PageColumn } from "./parts";
import { PAGES } from "./pages";
import { errorText, ipc } from "./ipc";
import { RestartBar, Sidebar, TitleBar } from "./shell";
import { StoreProvider, useStore } from "./store";

function Content() {
  const { section: page, settings, setZoom, toast } = useStore();
  // This window's store has the App sections only.
  const section = isSectionId(page) ? page : "general";
  const main = useRef<HTMLElement>(null);
  const { subtitle, wide, Section } = PAGES[section];
  useZoomKeys(settings.zoom, setZoom, toast);
  // F1 opens the Help article for the section on show.
  useHelpKey(() => settingsHelpTarget(section), (target) => void ipc.openHelp(target).catch((e) => toast(errorText(e), true)));
  // A new section starts at the top (a search jump scrolls to its row after this).
  useLayoutEffect(() => {
    main.current?.scrollTo?.({ top: 0 });
  }, [section]);
  return (
    <main ref={main} data-scroll-root className="relative min-w-0 flex-1 scroll-pt-16 overflow-auto">
      <RestartBar />
      <PageColumn title={SECTION_NAMES[section]} subtitle={subtitle} wide={wide}>
        <Section />
      </PageColumn>
    </main>
  );
}

export function SettingsApp() {
  return (
    <ToastProvider>
      <StoreProvider>
        <div className="flex h-screen flex-col overflow-hidden bg-s-win">
          <TitleBar />
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <Content />
          </div>
        </div>
      </StoreProvider>
    </ToastProvider>
  );
}
