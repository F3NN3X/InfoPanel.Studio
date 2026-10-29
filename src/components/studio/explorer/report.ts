/** Data › Report: gathers the troubleshooting report's input on this machine, then copies or saves the text. */
import { getCatalog, refreshCatalog } from "@/lib/catalog";
import { appInfo, isTauri, saveTextFile } from "@/lib/desktop";
import type { DashboardConfig } from "@/lib/layout";
import type { LocalInfo } from "../first-run/checks";
import { infopanelLocal } from "../first-run/commands";

const FILE_NAME = "infopanel-studio-report.txt";

/** The report for the config and Data API in use (the report module loads on first use). */
export async function buildReport(config: DashboardConfig | null, apiBase: string): Promise<string> {
  const start = performance.now();
  const [, info, local, { troubleshootingReport }] = await Promise.all([
    refreshCatalog(),
    appInfo().catch(() => undefined),
    infopanelLocal<LocalInfo>().catch(() => undefined),
    import("@/lib/troubleshooting-report"),
  ]);
  const ms = Math.round(performance.now() - start);
  const catalog = getCatalog();
  const ok = catalog.status === "ready";
  return troubleshootingReport({
    now: new Date(),
    // `paths` stays behind: it holds the user's folder names
    app: info ? { version: info.version, channel: info.channel, buildDate: info.buildDate, webview: info.webview, os: info.os } : null,
    apiBase,
    reach: ok ? { ok, ms } : { ok },
    infopanel: local
      ? { version: local.version, running: local.process !== null, dataApi: local.dataApi && { enabled: local.dataApi.enabled, port: local.dataApi.port }, profiles: local.profiles.length }
      : null,
    sensors: ok ? catalog.sensors : {},
    sources: ok ? catalog.sources : null,
    config,
  });
}

/** Saves the report: the native Save As in the desktop app, a download in a browser. Resolves to whether it was written. */
export async function saveReport(text: string): Promise<boolean> {
  if (isTauri()) return saveTextFile(FILE_NAME, text);
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = FILE_NAME;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
