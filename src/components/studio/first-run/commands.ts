/**
 * The first-run setup's desktop commands (src-tauri/src/infopanel_local.rs), kept with the setup's own chunk. Start,
 * Restart and the switches work only in a setup session the shell opened; the reads are undefined in a browser.
 */
import { isTauri } from "@/lib/desktop";
import type { Settings } from "@/settings/types";

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T | undefined> {
  if (!isTauri()) return undefined;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export const infopanelLocal = <T>(): Promise<T | undefined> => call<T>("infopanel_local");
export const infopanelStart = (): Promise<void | undefined> => call<void>("infopanel_start");
export const infopanelRestart = (): Promise<void | undefined> => call<void>("infopanel_restart");
export const portOwner = (port: number): Promise<{ pid: number; name: string } | null | undefined> => call("port_owner", { port });
export const localAddresses = (): Promise<string[] | undefined> => call<string[]>("list_local_addresses").catch(() => undefined);
export const setupOptions = (startAtLogin: boolean, checkForUpdates: boolean): Promise<Settings | undefined> =>
  call<Settings>("setup_options", { startAtLogin, checkForUpdates });
export const setupEnd = (): Promise<void | undefined> => call<void>("setup_end").catch(() => undefined);
