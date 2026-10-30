import type { ComponentType } from "react";
import type { SectionId } from "./model/search";
import { AboutSection } from "./sections/about";
import { AgentsSection } from "./sections/agents";
import { ChangelogSection } from "./sections/changelog";
import { DiagnosticsSection } from "./sections/diagnostics";
import { GeneralSection } from "./sections/general";
import { LogsSection } from "./sections/logs";
import { ServerSection } from "./sections/server";
import { TouchSection } from "./sections/touch";
import { UpdatesSection } from "./sections/updates";

export interface Page {
  subtitle: string;
  /** Diagnostics and Logs get the 1040px column. */
  wide?: boolean;
  Section: ComponentType;
}

/** The pages, shared by the settings window and Settings › App in the studio. */
export const PAGES: Record<SectionId, Page> = {
  general: { subtitle: "How the app starts, closes and scales.", Section: GeneralSection },
  server: { subtitle: "The local server the kiosk and studio load from.", Section: ServerSection },
  agents: { subtitle: "Claude Code and Codex on your dashboard.", Section: AgentsSection },
  touch: { subtitle: "Experimental: touch panels that drive the kiosk, never Windows.", Section: TouchSection },
  updates: { subtitle: "Get new versions of InfoPanel Studio.", Section: UpdatesSection },
  diagnostics: { subtitle: "Find errors and memory leaks.", wide: true, Section: DiagnosticsSection },
  logs: { subtitle: "Live output from the server, the app and the studio.", wide: true, Section: LogsSection },
  about: { subtitle: "Version, system and file locations.", Section: AboutSection },
  changelog: { subtitle: "What changed in the last 10 releases, newest first.", Section: ChangelogSection },
};
