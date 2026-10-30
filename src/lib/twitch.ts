/**
 * Twitch sign-in from the studio (ips-server's twitch module): `POST /api/twitch/signin` starts the device-code flow and
 * answers with the code to approve on twitch.tv; `POST /api/twitch/signout` cancels it or signs out. The status they
 * change arrives in the extras (`useExtras().twitch`); no token ever reaches the browser.
 */

export const TWITCH_SIGNIN_URL = "/api/twitch/signin";
export const TWITCH_SIGNOUT_URL = "/api/twitch/signout";
/** Where the code is entered. */
export const TWITCH_ACTIVATE_URL = "https://www.twitch.tv/activate";

export type SigninResult = { ok: true; userCode: string; verificationUri: string; expiresIn: number } | { ok: false; error: string };

const post = (url: string) =>
  fetch(url, {
    method: "POST",
    // The custom header makes a cross-site POST preflight (see the server's request guard).
    headers: { "Content-Type": "application/json", "X-Dashboard-Control": "1" },
    body: "{}",
  });

/** Starts a sign-in. Never throws: a refusal is the server's message. */
export async function twitchSignin(): Promise<SigninResult> {
  try {
    const res = await post(TWITCH_SIGNIN_URL);
    if (!res.ok) return { ok: false, error: (await res.text()) || `Twitch sign-in failed (${res.status})` };
    const body = (await res.json()) as { user_code?: unknown; verification_uri?: unknown; expires_in?: unknown };
    if (typeof body.user_code !== "string" || !body.user_code) return { ok: false, error: "The server sent no code." };
    return {
      ok: true,
      userCode: body.user_code,
      verificationUri: typeof body.verification_uri === "string" && body.verification_uri ? body.verification_uri : TWITCH_ACTIVATE_URL,
      expiresIn: typeof body.expires_in === "number" ? body.expires_in : 0,
    };
  } catch {
    return { ok: false, error: "The dashboard server didn't answer." };
  }
}

/** Cancels a sign-in under way, or signs out. Resolves to whether the server took it; never throws. */
export async function twitchSignout(): Promise<boolean> {
  try {
    return (await post(TWITCH_SIGNOUT_URL)).ok;
  } catch {
    return false;
  }
}
