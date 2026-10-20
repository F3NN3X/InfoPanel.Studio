import { useEffect, useLayoutEffect, useRef, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import { SECTION_NAMES, type SectionId } from "./model/search";
import { AboutSection } from "./sections/about";
import { AgentsSection } from "./sections/agents";
import { ChangelogSection } from "./sections/changelog";
import { DiagnosticsSection } from "./sections/diagnostics";
import { GeneralSection, stepZoom } from "./sections/general";
import { LogsSection } from "./sections/logs";
import { ServerSection } from "./sections/server";
import { UpdatesSection } from "./sections/updates";
import { RestartBar, Sidebar, TitleBar, ToastView } from "./shell";
import { StoreProvider, useStore } from "./store";

interface Page {
  subtitle: string;
  /** Diagnostics and Logs get the 1040px column. */
  wide?: boolean;
  Section: ComponentType;
}

const PAGES: Record<SectionId, Page> = {
  general: { subtitle: "How the app starts, closes and scales.", Section: GeneralSection },
  server: { subtitle: "The local server the kiosk and studio load from.", Section: ServerSection },
  agents: { subtitle: "Claude Code and Codex on your dashboard.", Section: AgentsSection },
  updates: { subtitle: "Get new versions of InfoPanel Studio.", Section: UpdatesSection },
  diagnostics: { subtitle: "Find errors and memory leaks.", wide: true, Section: DiagnosticsSection },
  logs: { subtitle: "Live output from the server, the app and the studio.", wide: true, Section: LogsSection },
  about: { subtitle: "Version, system and file locations.", Section: AboutSection },
  changelog: { subtitle: "Everything that changed, newest first.", Section: ChangelogSection },
};

/** Ctrl +, Ctrl - and Ctrl 0 zoom every app window. */
function useZoomKeys() {
  const { settings, setZoom } = useStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const step = e.key === "=" || e.key === "+" ? 1 : e.key === "-" ? -1 : e.key === "0" ? 0 : null;
      if (step === null) return;
      e.preventDefault();
      const next = stepZoom(settings.zoom, step);
      if (next !== settings.zoom) void setZoom(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings.zoom, setZoom]);
}

function Content() {
  const { section } = useStore();
  const main = useRef<HTMLElement>(null);
  const { subtitle, wide, Section } = PAGES[section];
  useZoomKeys();
  // A new section starts at the top (a search jump scrolls to its row after this).
  useLayoutEffect(() => {
    main.current?.scrollTo?.({ top: 0 });
  }, [section]);
  return (
    <main ref={main} data-scroll-root className="relative min-w-0 flex-1 overflow-auto">
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
