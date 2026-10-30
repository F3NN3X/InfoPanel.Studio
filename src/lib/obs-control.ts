/**
 * The OBS control the Stream Control tile and the OBS buttons use (ips-server's obs_control.rs): `POST /api/obs/act`
 * switches the scene, toggles the mic's mute and saves the replay. The state they read is the extras' `obs`
 * (`src/lib/extras.ts`). There is deliberately no start or stop stream action.
 */

export const OBS_ACT_URL = "/api/obs/act";

/** What `POST /api/obs/act` takes; a scene is addressed by the id the extras list. */
export type ObsAction = { op: "scene"; id: string } | { op: "mic" } | { op: "replay" };

/** Sends an action. Resolves to whether OBS took it; never throws. */
export async function obsAct(body: ObsAction): Promise<boolean> {
  try {
    const res = await fetch(OBS_ACT_URL, {
      method: "POST",
      // The custom header makes a cross-site POST preflight (see the server's request guard).
      headers: { "Content-Type": "application/json", "X-Dashboard-Control": "1" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}
