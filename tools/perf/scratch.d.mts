import type { ChildProcess } from "node:child_process";

export const FIXTURE_DIR: string;

export interface Scratch {
  base: string;
  dataApi: string;
  dataDir: string;
  /** The scratch user folder (INFOPANEL_STUDIO_CONFIG_DIR), where the agent hook key goes. */
  configDir: string;
  pid: number;
  output(): string;
  stop(): void;
}

export interface ScratchOptions {
  fixture?: string;
  env?: Record<string, string>;
  dataApiEnv?: Record<string, string>;
}

export interface PreparedScratch {
  tmp: string;
  dataDir: string;
  home: string;
  infopanel: string;
  dataApi: string;
  children: ChildProcess[];
  stop(): void;
}

export function prepareScratch(options?: Pick<ScratchOptions, "fixture" | "dataApiEnv">): Promise<PreparedScratch>;
export function startScratch(options?: ScratchOptions): Promise<Scratch>;
export function serverCommand(env?: Record<string, string | undefined>): { cmd: string; args: string[] };
