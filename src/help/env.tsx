import { createContext, useContext } from "react";
import { ipc } from "@/settings/ipc";
import type { SectionId } from "@/settings/model/search";
import { isTauri } from "@/lib/desktop";

/** What Help needs from where it runs: the desktop app's windows, or a plain browser tab. */
export interface HelpEnv {
  /** The Tauri window: it has a title bar, Settings in the studio and a version to show. */
  desktop: boolean;
  openSettings: (section: SectionId) => void;
  /** Opens a web address in the default browser. */
  openExternal: (url: string) => void;
}

export const desktopEnv: HelpEnv = {
  desktop: true,
  openSettings: (section) => void ipc.openSettingsInStudio(section).catch(() => {}),
  openExternal: (url) => void ipc.openExternal(url).catch(() => {}),
};

export const browserEnv: HelpEnv = {
  desktop: false,
  openSettings: () => {},
  openExternal: (url) => void window.open(url, "_blank", "noopener,noreferrer"),
};

/** The environment of this page. */
export const pageEnv = (): HelpEnv => (isTauri() ? desktopEnv : browserEnv);

const EnvContext = createContext<HelpEnv>(browserEnv);

export const EnvProvider = EnvContext.Provider;
export const useEnv = (): HelpEnv => useContext(EnvContext);
