/** Types for tools/packs/themely-check.mjs (tests/looks/walkthrough-snippets.test.ts runs the walkthrough's script through it). */
export interface CheckIssue {
  severity: "error" | "warn" | "info";
  rule: string;
  message: string;
}
export function analyseScript(source: string): Promise<{ issues: CheckIssue[]; perFrame: { loops: number; allocations: number } }>;
