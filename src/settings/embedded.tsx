import { useEffect, useLayoutEffect, useRef } from "react";
import "./embedded.css";
import { cn } from "@/lib/utils";
import { SECTION_NAMES, type SectionId } from "./model/search";
import { PAGES } from "./pages";
import { RestartBar, ToastView } from "./shell";
import { StoreProvider, useStore } from "./store";

/** The pages in the sub-nav's order (the spec's list, replaced by the real pages: PLAN decision 2). */
const NAV: SectionId[] = ["general", "server", "agents", "updates", "diagnostics", "logs", "about", "changelog"];

interface EmbeddedSettingsProps {
  /** The page to show; `seq` makes a repeat of the same one count (a link, the tray). */
  section?: SectionId;
  seq: number;
}

/** The 180 px page list, with the amber dot on Updates while one is waiting. */
function SubNav() {
  const { section, go, update } = useStore();
  const updateWaiting = update.state === "available" || update.state === "ready";
  return (
    <nav aria-label="App settings pages" className="flex w-[180px] shrink-0 flex-col gap-px overflow-auto border-r border-s-side-line bg-s-side px-2 py-3 max-sm:w-[112px] max-sm:px-1">
      {NAV.map((id) => {
        const on = section === id;
        return (
          <button
            key={id}
            type="button"
            aria-current={on ? "page" : undefined}
            onClick={() => go(id)}
            className={cn(
              "flex h-[30px] w-full cursor-pointer items-center gap-2 rounded-md border-0 px-2.5 text-left text-[12.5px] max-sm:px-1.5",
              on ? "bg-s-nav-on text-s-t1" : "bg-transparent text-s-muted hover:bg-s-nav-hover"
            )}
          >
            <span className="flex-1">{SECTION_NAMES[id]}</span>
            {id === "updates" && updateWaiting && <span title="An update is available" className="h-[7px] w-[7px] rounded-full bg-s-amber" />}
          </button>
        );
      })}
    </nav>
  );
}

function Page({ section, seq }: EmbeddedSettingsProps) {
  const { section: shown, go } = useStore();
  const main = useRef<HTMLElement>(null);
  const { subtitle, wide, Section } = PAGES[shown];
  // A link or the tray asked for a page while this is mounted.
  useEffect(() => {
    if (section) go(section);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, seq]);
  useLayoutEffect(() => {
    main.current?.scrollTo?.({ top: 0 });
  }, [shown]);
  return (
    <main ref={main} data-scroll-root className="relative min-w-0 flex-1 overflow-auto">
      <RestartBar />
      <div className={cn("mx-auto flex w-full min-w-0 flex-col gap-6 px-7 pb-16 pt-6 max-sm:px-3", wide ? "max-w-[1040px]" : "max-w-[780px]")}>
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-xl font-semibold tracking-[-0.01em]">{SECTION_NAMES[shown]}</h2>
          <p className="m-0 text-pretty text-[13px] leading-normal text-s-muted">{subtitle}</p>
        </div>
        <Section />
      </div>
      <ToastView />
    </main>
  );
}

/**
 * Settings › App (SPEC §10.1, PLAN decisions 2 and 5): the desktop settings pages as they are, in a lazy chunk the
 * studio loads only inside the desktop app, with a page list on the left and the restart bar on top. The studio's
 * origin reaches the shell through the commands `STUDIO_PERMISSIONS` grants (src-tauri/src/control.rs).
 */
export default function EmbeddedSettings(props: EmbeddedSettingsProps) {
  return (
    <StoreProvider initialSection={props.section}>
      <div className="s-scope flex min-h-0 flex-1 bg-s-win text-s-t1">
        <SubNav />
        <Page {...props} />
      </div>
    </StoreProvider>
  );
}
