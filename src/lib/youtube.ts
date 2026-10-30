/**
 * YouTube sign-in from the studio (ips-server's youtube module): `POST /api/youtube/signin` answers with the Google address
 * to open in the browser (the user's own Google client; Google sends the browser back to the server), `POST
 * /api/youtube/signout` cancels it or signs out. The status they change arrives in the extras (`useExtras().youtube`); no
 * token or client secret ever reaches the browser.
 */

import { useEffect, useState } from "react";

export const YOUTUBE_SIGNIN_URL = "/api/youtube/signin";
export const YOUTUBE_SIGNOUT_URL = "/api/youtube/signout";

/** A sign-in waiting for the user to approve it on Google; `expiresAt` is unix ms. */
export interface PendingYoutube {
  authUrl: string;
  expiresAt: number;
}

export type YoutubeSigninResult = { ok: true; authUrl: string } | { ok: false; error: string };

const post = (url: string) =>
  fetch(url, {
    method: "POST",
    // The custom header makes a cross-site POST preflight (see the server's request guard).
    headers: { "Content-Type": "application/json", "X-Dashboard-Control": "1" },
    body: "{}",
  });

/** The address to open: Google's own sign-in page over https. Whatever else the server sent (a bad or hijacked reply) is null. */
export function safeGoogleUrl(uri: unknown): string | null {
  if (typeof uri !== "string") return null;
  try {
    const url = new URL(uri);
    return url.protocol === "https:" && !url.username && !url.password && url.hostname === "accounts.google.com" ? url.href : null;
  } catch {
    return null;
  }
}

/** Starts a sign-in. Never throws: a refusal is the server's message. */
export async function youtubeSignin(): Promise<YoutubeSigninResult> {
  try {
    const res = await post(YOUTUBE_SIGNIN_URL);
    if (!res.ok) return { ok: false, error: (await res.text()) || `YouTube sign-in failed (${res.status})` };
    const authUrl = safeGoogleUrl(((await res.json()) as { authUrl?: unknown }).authUrl);
    return authUrl ? { ok: true, authUrl } : { ok: false, error: "The server sent no Google address." };
  } catch {
    return { ok: false, error: "The dashboard server didn't answer." };
  }
}

/** Cancels a sign-in under way, or signs out. Resolves to whether the server took it; never throws. */
export async function youtubeSignout(): Promise<boolean> {
  try {
    return (await post(YOUTUBE_SIGNOUT_URL)).ok;
  } catch {
    return false;
  }
}

/** The sign-in under way and the server's last message about one (`GET /api/youtube/signin`, this machine only); null on any failure. */
export async function fetchYoutubePending(): Promise<{ pending: PendingYoutube | null; error: string | null } | null> {
  try {
    const res = await fetch(YOUTUBE_SIGNIN_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { pending?: { auth_url?: unknown; expires_at?: unknown } | null; error?: unknown };
    const authUrl = safeGoogleUrl(body.pending?.auth_url);
    const pending = authUrl ? { authUrl, expiresAt: typeof body.pending?.expires_at === "number" ? body.pending.expires_at : 0 } : null;
    return { pending, error: typeof body.error === "string" && body.error ? body.error : null };
  } catch {
    return null;
  }
}

/** How often the pending sign-in is asked for while one is waiting. */
export const PENDING_POLL_MS = 1500;

/** The pending sign-in, polled from the server while `active` (the extras' `youtube.pending`); null otherwise. */
export function useYoutubePending(active: boolean): PendingYoutube | null {
  const [pending, setPending] = useState<PendingYoutube | null>(null);
  useEffect(() => {
    if (!active) {
      setPending(null);
      return;
    }
    let alive = true;
    const poll = () => void fetchYoutubePending().then((r) => alive && r && setPending(r.pending));
    poll();
    const t = setInterval(poll, PENDING_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [active]);
  return pending;
}
