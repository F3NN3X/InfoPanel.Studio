export interface WinProcess {
  ProcessId: number;
  ParentProcessId: number;
  Name: string;
  CommandLine: string | null;
  KernelModeTime: number | string;
  UserModeTime: number | string;
  /** Private bytes. */
  PrivatePageCount: number | string;
}

export type Role = "app" | "sidecar" | "webview" | "renderer" | "gpu" | "utility";

export function processes(): WinProcess[];
export function appTree(all: WinProcess[]): { pid: number; role: Role; cpu100ns: number; bytes: number }[];
