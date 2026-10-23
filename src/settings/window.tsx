import { lazy, Suspense, useEffect, useState } from "react";
import "./window.css";
import { settingsHelpTarget } from "@/help/context";
import { useHelpKey } from "@/help/use-help-key";
import { isTauri, openHelp } from "@/lib/desktop";
import { isPageId, PAGE_NAMES, parsePageTarget } from "./model/search";
import { NavGroupLabel, NavItem } from "./nav";
import { PREFERENCE_PAGES, WindowMain } from "./window-pages";

/** The desktop app's window, with the App pages (a lazy chunk: it is the only part that loads `@tauri-apps/api`). */
const DesktopSettingsWindow = lazy(() => import("./window-desktop"));

const BROWSER_PAGES = ["dashboard", "studio"] as const;
type BrowserPage = (typeof BROWSER_PAGES)[number];

/** The page and group the URL hash names (`#dashboard/clock`), else Dashboard. */
const fromHash = () => parsePageTarget<BrowserPage>(window.location.hash.slice(1), BROWSER_PAGES) ?? { section: "dashboard" as const };

/** An App page the hash names (`#general/open-studio`), which only the desktop app's Settings window has. */
function appPageAsked(): string | null {
  const id = window.location.hash.slice(1).split("/")[0];
  return isPageId(id) && !(BROWSER_PAGES as readonly string[]).includes(id) ? PAGE_NAMES[id] : null;
}

/**
 * Settings in a browser tab (PLAN decision 23): Dashboard and Studio, and a line saying where the App settings are.
 * A Studio link to another page while the tab is open changes its hash.
 */
function BrowserSettings() {
  const [target, setTarget] = useState(() => ({ ...fromHash(), n: 0 }));
  // A Studio link to an App setting lands here in a browser: say where it is rather than show another page silently.
  const [appPage, setAppPage] = useState(appPageAsked);
  useEffect(() => {
    const onHash = () => {
      setTarget((t) => ({ ...fromHash(), n: t.n + 1 }));
      setAppPage(appPageAsked());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useHelpKey(() => settingsHelpTarget(target.section), (help) => void openHelp(help).catch(() => {}));
  const page = PREFERENCE_PAGES[target.section];
  const { Section } = page;
  return (
    <div className="s-scope flex h-screen overflow-hidden bg-s-win text-s-t1">
      <aside className="flex w-[236px] shrink-0 flex-col border-r border-s-side-line bg-s-side px-2 pb-4 pt-1 max-sm:w-[150px]">
        <nav aria-label="Settings pages" className="contents">
          <NavGroupLabel>Preferences</NavGroupLabel>
          {BROWSER_PAGES.map((id) => (
            <NavItem
              key={id}
              id={id}
              on={target.section === id}
              onClick={() => {
                setAppPage(null);
                setTarget((t) => ({ section: id, n: t.n + 1 }));
              }}
            />
          ))}
        </nav>
        <p className="m-0 mt-auto px-2.5 text-[11.5px] leading-normal text-s-dim">
          Startup, server, updates, coding agents and logs are set in the InfoPanel Studio desktop app.
        </p>
      </aside>
      <WindowMain
        title={PAGE_NAMES[target.section]}
        subtitle={page.subtitle}
        focus={target.row ? { row: target.row, n: target.n } : null}
        top={
          appPage && (
            <p role="status" className="m-0 border-b border-s-side-line bg-s-side px-8 py-2.5 text-[12.5px] text-s-t2 max-sm:px-4">
              Change this in the InfoPanel Studio app's Settings ({appPage}).
            </p>
          )
        }
      >
        <Section />
      </WindowMain>
    </div>
  );
}

/**
 * The Settings window (PLAN decisions 21 to 23), served with the Studio at `/?settings`: the desktop app's Settings
 * window loads it, and a browser opens it in a tab. Being on the Studio's origin, it shares the Studio's stored
 * preferences and reaches the config API and the Studio window (src/lib/studio-channel.ts).
 */
export default function SettingsWindow() {
  useEffect(() => {
    document.title = "InfoPanel Studio settings";
  }, []);
  if (!isTauri()) return <BrowserSettings />;
  return (
    <Suspense fallback={null}>
      <DesktopSettingsWindow />
    </Suspense>
  );
}
