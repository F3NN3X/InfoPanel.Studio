export interface Feature {
  id: string;
  critical?: boolean;
  fallback?: boolean;
  summary: string;
  paths: string[];
  exclude?: string[];
  tests: string[];
  checks: string[];
  report?: string[];
  note?: string;
}

export interface Check {
  cmd?: string;
  fullCmd?: string;
  fastCmd?: string;
  cwd?: string;
  platform?: string;
  needs?: string[];
  files?: string[];
  tests?: string[];
  testsExclude?: string[];
  related?: boolean;
  emptyMeansAll?: boolean;
  always?: boolean;
  escalate?: boolean;
  when: string;
}

export interface FeatureMap {
  version: number;
  checks: Record<string, Check>;
  features: Feature[];
}

export const MAP_FILE: string;
export function matchesGlob(file: string, pattern: string): boolean;
export function matchesAny(file: string, patterns?: string[]): boolean;
export function loadMap(root: string): FeatureMap;
export function claims(feature: Feature, file: string): boolean;
export function featuresOf(file: string, map: FeatureMap): Feature[];
export function resolveChanges(files: string[], map: FeatureMap): { byFeature: Map<string, string[]>; unmapped: string[] };
export function whereIs(file: string, map: FeatureMap): { id: string; tests: string[]; checks: string[] }[];
