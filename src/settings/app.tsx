import { useLayoutEffect, useRef } from "react";
import { useZoomKeys } from "@/app-window/zoom";
import { useHelpKey } from "@/help/use-help-key";
import { settingsHelpTarget } from "@/help/context";
import { cn } from "@/lib/utils";
import { isSectionId, SECTION_NAMES } from "./model/search";
import { PAGES } from "./pages";
import { errorText, ipc } from "./ipc";
import { RestartBar, Sidebar, TitleBar, ToastView } from "./shell";
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
      <div className={cn("mx-auto flex w-full min-w-0 flex-col gap-7 px-8 pb-20 pt-8", wide ? "max-w-[1040px]" : "max-w-[780px]")}>
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-2xl font-semibold tracking-[-0.015em]">{SECTION_NAMES[section]}</h1>
          <p className="m-0 text-pretty text-[13.5px] leading-normal text-s-muted">{subtitle}</p>
        </div>
        <Section />
      </div>
      <ToastView />
    </main>
  );
}

export function SettingsApp() {
  return (
    <StoreProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-s-win">
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <Content />
        </div>
      </div>
    </StoreProvider>
  );
}
