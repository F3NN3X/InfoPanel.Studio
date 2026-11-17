/**
 * The media keys a touch action presses (ips-server's media.rs, pinned layer P6): `POST /api/media/act` presses play/pause,
 * next or previous on the PC, as a keyboard's media keys do, so the player Windows sends them to answers. Guarded like the
 * audio and OBS writes (another machine only with remote editing on).
 */
import type { MediaKey } from "./pinned";

export const MEDIA_ACT_URL = "/api/media/act";

/** Presses `key`. Resolves to whether the PC took it; never throws. */
export async function mediaKey(key: MediaKey): Promise<boolean> {
  try {
    const res = await fetch(MEDIA_ACT_URL, {
      method: "POST",
      // The custom header makes a cross-site POST preflight (see the server's request guard).
      headers: { "Content-Type": "application/json", "X-Dashboard-Control": "1" },
      body: JSON.stringify({ key }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
