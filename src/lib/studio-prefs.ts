// The studio preferences the server keeps (GET and PUT /api/studio-prefs, ips-server's studio_prefs.rs), so they follow the
// user between the app window and a studio opened in a browser, which each have their own localStorage.

export const STUDIO_PREFS_URL = "/api/studio-prefs";

/** The server's preferences (key → value); throws when it can't be reached. */
export async function fetchStudioPrefs(): Promise<Record<string, string>> {
  const res = await fetch(STUDIO_PREFS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`studio preferences: ${res.status}`);
  return (await res.json()) as Record<string, string>;
}

/** Saves one preference on the server; throws on a refusal or when it can't be reached. */
export async function saveStudioPref(key: string, value: string): Promise<void> {
  const res = await fetch(STUDIO_PREFS_URL, {
    method: "PUT",
    // The custom header makes a cross-site write preflight, as for the config.
    headers: { "Content-Type": "application/json", "X-Dashboard-Config": "1" },
    body: JSON.stringify({ [key]: value }),
  });
  if (!res.ok) throw new Error(`studio preferences: ${res.status}`);
}
