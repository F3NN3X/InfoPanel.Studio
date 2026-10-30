/**
 * Twitch sign-in from the studio (ips-server's twitch module): `POST /api/twitch/signin` starts the device-code flow and
 * answers with the code to approve on twitch.tv; `POST /api/twitch/signout` cancels it or signs out. The status they
 * change arrives in the extras (`useExtras().twitch`); no token ever reaches the browser.
 */

import { useEffect, useState } from "react";

export const TWITCH_SIGNIN_URL = "/api/twitch/signin";
export const TWITCH_SIGNOUT_URL = "/api/twitch/signout";
/** Where the code is entered. */
export const TWITCH_ACTIVATE_URL = "https://www.twitch.tv/activate";

/** A sign-in waiting for its code to be approved; `expiresAt` is unix ms. */
export interface PendingSignin {
  userCode: string;
  verificationUri: string;
  expiresAt: number;
}

export type SigninResult = { ok: true; userCode: string; verificationUri: string; expiresIn: number } | { ok: false; error: string };

const post = (url: string) =>
  fetch(url, {
    method: "POST",
    // The custom header makes a cross-site POST preflight (see the server's request guard).
    headers: { "Content-Type": "application/json", "X-Dashboard-Control": "1" },
    body: "{}",
  });

/**
 * The address to send the user to: Twitch's own, over https. Whatever the server sent that is not (a bad or hijacked
 * reply) becomes the usual activate page, so the link can never point elsewhere.
 */
export function safeActivateUrl(uri: string): string {
  try {
    const url = new URL(uri);
    if (url.protocol === "https:" && !url.username && !url.password && (url.hostname === "twitch.tv" || url.hostname.endsWith(".twitch.tv"))) return url.href;
  } catch {
    // Not an address at all.
  }
  return TWITCH_ACTIVATE_URL;
}

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

/** The sign-in under way and the server's last message about one (`GET /api/twitch/signin`, this machine only); null on any failure. */
export async function fetchTwitchPending(): Promise<{ pending: PendingSignin | null; error: string | null } | null> {
  try {
    const res = await fetch(TWITCH_SIGNIN_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { pending?: { user_code?: unknown; verification_uri?: unknown; expires_at?: unknown } | null; error?: unknown };
    const p = body.pending;
    const pending = p && typeof p.user_code === "string" && p.user_code ? { userCode: p.user_code, verificationUri: typeof p.verification_uri === "string" ? p.verification_uri : "", expiresAt: typeof p.expires_at === "number" ? p.expires_at : 0 } : null;
    return { pending, error: typeof body.error === "string" && body.error ? body.error : null };
  } catch {
    return null;
  }
}

/** How often the pending code is asked for while a sign-in is waiting. */
export const PENDING_POLL_MS = 1500;

/** The pending sign-in, polled from the server while `active` (the extras' `twitch.pending`); null otherwise. */
export function useTwitchPending(active: boolean): PendingSignin | null {
  const [pending, setPending] = useState<PendingSignin | null>(null);
  useEffect(() => {
    if (!active) {
      setPending(null);
      return;
    }
    let alive = true;
    const poll = () => void fetchTwitchPending().then((r) => alive && r && setPending(r.pending));
    poll();
    const t = setInterval(poll, PENDING_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [active]);
  return pending;
}
