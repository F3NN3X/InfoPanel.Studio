// The feature map (tests/feature-map.json): loading it, matching files against its globs, and turning a set of
// changed files into the features they belong to. Pure apart from loadMap. Node built-ins only.
import fs from "node:fs";
import path from "node:path";

export const MAP_FILE = "tests/feature-map.json";

/** Whether `file` (a repo-relative path with forward slashes) matches the glob. `**` skips dotfiles: name them. */
export function matchesGlob(file, pattern) {
  return path.posix.matchesGlob(file, pattern);
}

/** Whether `file` matches any of the globs. */
export function matchesAny(file, patterns = []) {
  return patterns.some((pattern) => matchesGlob(file, pattern));
}

export function loadMap(root) {
  return JSON.parse(fs.readFileSync(path.join(root, MAP_FILE), "utf8"));
}

/** Whether the feature's `paths` claim the file (after its `exclude`s). */
export function claims(feature, file) {
  return matchesAny(file, feature.paths) && !matchesAny(file, feature.exclude);
}

/**
 * The features a changed file belongs to. A fallback feature (docs) only counts when no other feature claims the file.
 * A file under tests/ also selects the features that list it in `tests`.
 */
export function featuresOf(file, map) {
  const claimed = map.features.filter((feature) => claims(feature, file));
  const listed = map.features.filter((feature) => matchesAny(file, feature.tests));
  const chosen = new Set([...claimed.filter((feature) => !feature.fallback), ...listed]);
  if (chosen.size === 0) for (const feature of claimed) chosen.add(feature);
  return [...chosen];
}

/**
 * Group changed files by feature. `unmapped` lists the files no feature claims or lists: that is an error, new files
 * are mapped in the change that adds them.
 */
export function resolveChanges(files, map) {
  const byFeature = new Map();
  const unmapped = [];
  for (const file of files) {
    const features = featuresOf(file, map);
    if (features.length === 0) unmapped.push(file);
    for (const feature of features) byFeature.set(feature.id, [...(byFeature.get(feature.id) ?? []), file]);
  }
  return { byFeature, unmapped };
}

/** What `--where <path>` prints: the features of a file and their test globs. */
export function whereIs(file, map) {
  return featuresOf(file, map).map((feature) => ({ id: feature.id, tests: feature.tests, checks: feature.checks }));
}
