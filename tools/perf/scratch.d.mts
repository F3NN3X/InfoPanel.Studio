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
}

export function startScratch(options?: ScratchOptions): Promise<Scratch>;
export function serverCommand(env?: Record<string, string | undefined>): { cmd: string; args: string[] };
