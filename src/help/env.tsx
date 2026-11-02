import { createContext, useContext } from "react";
import { errorText, ipc } from "@/settings/ipc";
import type { SectionId } from "@/settings/model/search";
import { isTauri } from "@/lib/desktop";

/** What Help needs from where it runs: the desktop app's windows, or a plain browser tab. */
export interface HelpEnv {
  /** The Tauri window: it has a title bar, a Settings window and a version to show. */
  desktop: boolean;
  openSettings: (section: SectionId) => void;
  /** Opens a web address in the default browser. */
  openExternal: (url: string) => void;
}

let onFailure: (message: string) => void = () => {};

/** Where a failed shell call says so: the Help window sets this to show it, so a click is never silent. */
export function setFailureHandler(handler: (message: string) => void): () => void {
  onFailure = handler;
  return () => {
    if (onFailure === handler) onFailure = () => {};
  };
}

/** Says a failed shell call out loud (see `setFailureHandler`). */
export const reportFailure = (e: unknown) => onFailure(errorText(e));

export const desktopEnv: HelpEnv = {
  desktop: true,
  openSettings: (section) => void ipc.openSettings(section).catch(reportFailure),
  openExternal: (url) => void ipc.openExternal(url).catch(reportFailure),
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
