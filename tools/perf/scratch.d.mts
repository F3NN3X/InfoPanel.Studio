import type { ChildProcess } from "node:child_process";

export const FIXTURE_DIR: string;

export interface Scratch {
  base: string;
  dataApi: string;
  dataDir: string;
  pid: number;
  output(): string;
  stop(): void;
}

export interface ScratchOptions {
  fixture?: string;
  env?: Record<string, string>;
  dataApiEnv?: Record<string, string>;
  nodeArgs?: string[];
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
