// Downgrade guard for POST /api/config.
//
// An older build that loads a newer config can drop what it does not know
// (v3 added profile pages; v4 rewrote the legacy module ids to templates,
// which a v3 build cannot render; v5 moved canvases to the canvas store,
// leaving a ref a v4 build cannot draw; v6 moved the widget style onto the
// widget theme, which a v5 build reads as every widget's own look) and push
// that copy back. The server refuses a
// save whose `version` is below the stored config's; the studio then asks
// for a reload instead of overwriting.
//
// Node built-ins only. Pure; exported for the tests.

const versionOf = (config) =>
  config && typeof config === "object" && typeof config.version === "number" ? config.version : 0;

/** null to accept, or `{ status, message }` when the stored config is newer than the incoming one. */
export function versionRefusal(storedText, incoming) {
  let stored;
  try {
    stored = JSON.parse(storedText);
  } catch {
    return null;
  }
  if (versionOf(stored) <= versionOf(incoming)) return null;
  return { status: 409, message: "a newer dashboard version saved this config; reload" };
}
