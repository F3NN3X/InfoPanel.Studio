import { useEffect, useState } from "react";
import type { YoutubeState } from "@/lib/extras";
import type { PendingYoutube, YoutubeSigninResult } from "@/lib/youtube";
import { cn } from "@/lib/utils";
import { FIELD, StackRow } from "@/components/studio/setting-rows";

const BUTTON = "flex h-[28px] items-center gap-1.5 rounded-[6px] border border-ui-default px-2.5 text-[12px] text-ui-2 hover:bg-ui-hover hover:text-ui-1 disabled:opacity-50";

/** A Google project's units per day. */
export const DAILY_UNITS = 10_000;
export const CHAT_INTERVALS = [5, 10, 20] as const;

const STEPS: { text: string; href?: string; link?: string }[] = [
  { text: "Open the", href: "https://console.cloud.google.com/projectcreate", link: "Google Cloud Console and create a project" },
  { text: "Enable", href: "https://console.cloud.google.com/apis/library/youtube.googleapis.com", link: "YouTube Data API v3" },
  { text: "Set up the", href: "https://console.cloud.google.com/apis/credentials/consent", link: "OAuth consent screen" },
  { text: "(External) and add yourself as a test user." },
  { text: "Under", href: "https://console.cloud.google.com/apis/credentials", link: "Credentials" },
  { text: "choose Create credentials › OAuth client ID, type Desktop app." },
  { text: "Copy the Client ID and the client secret into the fields below." },
];

/** "m:ss" left until `at`; "0:00" once it has passed. */
export function countdown(at: number, now: number): string {
  const s = Math.max(0, Math.ceil((at - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Hours of live chat a day fit in the quota when the chat is read every `interval` seconds (5 units a read). */
export const chatHoursPerDay = (interval: number): number => Math.round((DAILY_UNITS / ((5 * 3600) / interval)) * 10) / 10;

export interface YoutubeBlockProps {
  /** The server's YouTube status (`useExtras().youtube`). */
  state: YoutubeState;
  /** Whether a Google client is saved (the studio is never told the client itself). */
  clientConfigured: boolean;
  /** The saved chat refresh in seconds. */
  chatInterval: number;
  /** The sign-in page waiting for approval (`useYoutubePending`). */
  pending: PendingYoutube | null;
  /** Saves the client; the secret is "" to keep the saved one. Resolves to whether it was kept. */
  onSaveClient: (clientId: string, clientSecret: string) => Promise<boolean>;
  onSaveInterval: (seconds: number) => Promise<boolean>;
  onSignin: () => Promise<YoutubeSigninResult>;
  /** Cancels a sign-in under way. */
  onCancel: () => void;
  onSignout: () => void;
  /** Opens a web address in the browser (the desktop app has its own way). */
  onOpen: (url: string) => void;
  /** The time now in ms; tests hold it still. */
  now?: () => number;
}

/** The YouTube sign-in with the user's own Google client: setup steps, the client, sign-in, chat refresh and quota. */
export function YoutubeBlock({ state, clientConfigured, chatInterval, pending, onSaveClient, onSaveInterval, onSignin, onCancel, onSignout, onOpen, now = Date.now }: YoutubeBlockProps) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [tick, setTick] = useState(now());
  useEffect(() => {
    if (!pending) return;
    setTick(now());
    const t = setInterval(() => setTick(now()), 1000);
    return () => clearInterval(t);
  }, [pending, now]);
  const waiting = pending !== null || state.pending;
  const status = state.signedIn ? (state.connected ? "Chat connected" : state.live ? "Live" : "Signed in, not live") : waiting ? "Waiting for approval" : clientConfigured ? "Signed out" : "Not set up";
  const shown = error || state.error;
  const link = (href: string, text: string) => (
    <a
      key={href}
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-ui-2 underline"
      onClick={(e) => {
        e.preventDefault();
        onOpen(href);
      }}
    >
      {text}
    </a>
  );
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-[12px] font-semibold text-ui-1">
        YouTube
        <span className="text-[11px] font-normal text-ui-4">{status}</span>
      </div>
      {!state.signedIn && (
        <>
          <details className="text-[11px] leading-snug text-ui-4">
            <summary className="cursor-pointer text-ui-3">Set up your Google client</summary>
            <p className="mt-1">YouTube allows each Google project 10,000 units a day, so you make your own project and client.</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              {STEPS.map((s) => (
                <li key={s.text + (s.link ?? "")}>
                  {s.text} {s.href && s.link && link(s.href, s.link)}
                </li>
              ))}
            </ol>
          </details>
          <StackRow label="Client ID">
            <input aria-label="Google client ID" autoComplete="off" value={clientId} placeholder={clientConfigured ? "Saved" : "…apps.googleusercontent.com"} onChange={(e) => setClientId(e.target.value)} className={cn(FIELD, "h-[30px] w-full")} />
          </StackRow>
          <StackRow label="Client secret" hint="Saved on the dashboard server only; leave blank to keep the saved one.">
            <input aria-label="Google client secret" type="password" autoComplete="off" value={secret} placeholder={clientConfigured ? "Saved" : "None"} onChange={(e) => setSecret(e.target.value)} className={cn(FIELD, "h-[30px] w-full")} />
          </StackRow>
          <div className="flex gap-2">
            <button
              type="button"
              className={BUTTON}
              disabled={!clientId.trim() && !secret}
              onClick={async () => {
                if (await onSaveClient(clientId.trim(), secret)) {
                  setClientId("");
                  setSecret("");
                }
              }}
            >
              Save client
            </button>
            {!waiting && (
              <button
                type="button"
                className={BUTTON}
                disabled={busy || !clientConfigured}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  const res = await onSignin();
                  if (res.ok) onOpen(res.authUrl);
                  else setError(res.error);
                  setBusy(false);
                }}
              >
                Sign in with Google
              </button>
            )}
          </div>
        </>
      )}
      {waiting && !state.signedIn && (
        <div className="space-y-1.5">
          <p className="text-[11px] leading-snug text-ui-4">Finish signing in in your browser. This page updates when you are done.</p>
          <div className="flex items-center justify-between text-[11px] text-ui-4">
            <span>{pending ? `Expires in ${countdown(pending.expiresAt, tick)}` : ""}</span>
            <span className="flex gap-2">
              {pending && (
                <button type="button" className={BUTTON} onClick={() => onOpen(pending.authUrl)}>
                  Open again
                </button>
              )}
              <button type="button" className={BUTTON} onClick={onCancel}>
                Cancel
              </button>
            </span>
          </div>
        </div>
      )}
      {state.signedIn && (
        <>
          <div className="text-[12px] text-ui-2">
            Signed in as <span className="font-semibold">{state.channel}</span>
          </div>
          <StackRow label="Chat refresh" hint="How often the live chat is read. Each read costs 5 units of the daily quota.">
            <div className="flex items-center gap-2">
              <select aria-label="Chat refresh" value={chatInterval} onChange={(e) => void onSaveInterval(Number(e.target.value))} className="h-7 rounded-md border border-ui-strong bg-ui-hover px-1.5 text-[12px] text-ui-1">
                {CHAT_INTERVALS.map((s) => (
                  <option key={s} value={s}>
                    {s} s
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-ui-4">About {chatHoursPerDay(chatInterval)} hours of live chat a day.</span>
            </div>
          </StackRow>
          <p className="text-[11px] text-ui-4">
            About {state.quota.used.toLocaleString("en-US")} of {DAILY_UNITS.toLocaleString("en-US")} units used today
            {state.quota.estimatePerHour > 0 ? `, about ${state.quota.estimatePerHour.toLocaleString("en-US")} an hour at this rate.` : "."}
          </p>
          <button type="button" className={BUTTON} onClick={onSignout}>
            Sign out
          </button>
        </>
      )}
      {shown && <p className="text-[11px] text-ui-danger">{shown}</p>}
    </div>
  );
}
