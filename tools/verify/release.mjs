// A release PR only bumps versions. This tells such a manifest change from a real one by content: the old and the new
// text are equal once the version fields are removed. Pure (the caller reads the files). Node built-ins only.

export const RELEASE_FEATURE = "release-version";

const lines = (text) => text.replace(/\r\n/g, "\n").split("\n");

function withoutJsonVersions(text, isLock) {
  const json = JSON.parse(text);
  delete json.version;
  if (isLock && json.packages?.[""]) delete json.packages[""].version;
  return JSON.stringify(json);
}

/** Cargo.toml: drops the `version` line of the [package] table only, never a dependency's. */
function withoutTomlVersion(text) {
  let table = "";
  return lines(text)
    .filter((line) => {
      const header = /^\s*\[([^\]]*)\]\s*(?:#.*)?$/.exec(line);
      if (header) table = header[1].trim();
      return !(table === "package" && /^\s*version\s*=/.test(line));
    })
    .join("\n");
}

/** Cargo.lock: drops `version` from the workspace's own [[package]] entries (no `source =` line), keeps registry ones. */
function withoutLockVersions(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/(?=^\[\[package\]\]$)/m)
    .map((block) => (/^source\s*=/m.test(block) ? block : block.replace(/^version\s*=.*\n?/m, "")))
    .join("");
}

const STRIPPERS = [
  [/(^|\/)package\.json$/, (text) => withoutJsonVersions(text, false)],
  [/(^|\/)package-lock\.json$/, (text) => withoutJsonVersions(text, true)],
  [/(^|\/)Cargo\.toml$/, withoutTomlVersion],
  [/(^|\/)Cargo\.lock$/, withoutLockVersions],
];

/** Whether `file` differs between `oldText` and `newText` in its version fields only. A file it can't read is not. */
export function isVersionOnly(file, oldText, newText) {
  const stripper = STRIPPERS.find(([pattern]) => pattern.test(file))?.[1];
  if (!stripper || oldText == null || newText == null) return false;
  try {
    return stripper(oldText) === stripper(newText);
  } catch {
    return false;
  }
}

/**
 * Splits changed files into the version-only manifests and the rest. `read(file)` gives `{ old, new }` text, or null when
 * the file was added, deleted or has no base, which keeps it out of the version-only group.
 */
export function splitVersionOnly(files, read) {
  const versionOnly = [];
  const rest = [];
  for (const file of files) {
    const text = STRIPPERS.some(([pattern]) => pattern.test(file)) ? read(file) : null;
    (text && isVersionOnly(file, text.old, text.new) ? versionOnly : rest).push(file);
  }
  return { versionOnly, rest };
}
