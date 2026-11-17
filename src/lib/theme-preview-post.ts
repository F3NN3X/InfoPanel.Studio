import { CONTROL_URL, STUDIO_SESSION } from "./control";

/**
 * Show a theme preview on the kiosks (the body `theme-preview.ts` describes), or take this studio's back (`null`).
 * Resolves to whether the server took it; never throws. Kept out of control.ts so only the Theme view's chunk carries it.
 */
export async function postThemePreview(preview: object | null): Promise<boolean> {
  try {
    const res = await fetch(`${CONTROL_URL}/preview`, {
      method: "POST",
      // The custom header makes a cross-site POST preflight (see the server's request guard).
      headers: { "Content-Type": "application/json", "X-Dashboard-Control": "1" },
      body: JSON.stringify({ session: STUDIO_SESSION, preview }),
      keepalive: preview === null,
    });
    return res.ok;
  } catch {
    return false;
  }
}
