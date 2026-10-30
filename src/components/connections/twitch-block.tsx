import { useEffect, useState } from "react";
import type { TwitchState } from "@/lib/extras";
import { safeActivateUrl, type PendingSignin, type SigninResult } from "@/lib/twitch";
import { cn } from "@/lib/utils";
import { FIELD, StackRow } from "@/components/studio/setting-rows";

const BUTTON = "flex h-[28px] items-center gap-1.5 rounded-[6px] border border-ui-default px-2.5 text-[12px] text-ui-2 hover:bg-ui-hover hover:text-ui-1 disabled:opacity-50";

export interface TwitchBlockProps {
  /** The server's Twitch status (`useExtras().twitch`). */
  state: TwitchState;
  /** The code to approve while a sign-in is pending (`useTwitchPending`; the extras do not carry it). */
  pending: PendingSignin | null;
  /** The chat channel saved ("" = the user's own). */
  channel: string;
  onSignin: () => Promise<SigninResult>;
  /** Cancels a sign-in under way. */
  onCancel: () => void;
  onSignout: () => void;
  /** Saves the chat channel; resolves to whether it was kept. */
  onSaveChannel: (channel: string) => Promise<boolean>;
  /** Opens a web address in the browser (the desktop app has its own way). */
  onOpen: (url: string) => void;
  /** The time now in ms; tests hold it still. */
  now?: () => number;
}

/** "m:ss" left until `at`; "0:00" once it has passed. */
export function countdown(at: number, now: number): string {
  const s = Math.max(0, Math.ceil((at - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The Twitch sign-in: signed out, a code to approve, or signed in with the chat channel. Knows nothing of where it is shown. */
export function TwitchBlock({ state, pending, channel, onSignin, onCancel, onSignout, onSaveChannel, onOpen, now = Date.now }: TwitchBlockProps) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(channel);
  const [tick, setTick] = useState(now());
  useEffect(() => {
    if (!pending) return;
    setTick(now());
    const t = setInterval(() => setTick(now()), 1000);
    return () => clearInterval(t);
  }, [pending, now]);
  useEffect(() => setDraft(channel), [channel]);
  const status = state.signedIn ? (state.connected ? "Chat connected" : "Connecting chat") : pending || state.pending ? "Waiting for approval" : "Signed out";
  const shown = error || state.error;
  const url = safeActivateUrl(pending?.verificationUri ?? "");
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-[12px] font-semibold text-ui-1">
        Twitch
        <span className="text-[11px] font-normal text-ui-4">{status}</span>
      </div>
      {pending ? (
        <div className="space-y-1.5">
          <p className="text-[11px] leading-snug text-ui-4">
            Open{" "}
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-ui-2 underline"
              onClick={(e) => {
                e.preventDefault();
                onOpen(url);
              }}
            >
              {url}
            </a>{" "}
            and enter this code:
          </p>
          <div aria-label="Twitch code" className="select-all text-center text-[26px] font-semibold tracking-[0.18em] text-ui-1">
            {pending.userCode}
          </div>
          <div className="flex items-center justify-between text-[11px] text-ui-4">
            <span>Expires in {countdown(pending.expiresAt, tick)}</span>
            <button type="button" className={BUTTON} onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : state.signedIn ? (
        <>
          <div className="text-[12px] text-ui-2">
            Signed in as <span className="font-semibold">{state.login}</span>
          </div>
          <StackRow label="Chat channel" hint="Whose chat Stream Chat reads. Leave blank for your own.">
            <div className="flex gap-2">
              <input aria-label="Twitch chat channel" value={draft} placeholder={state.login} onChange={(e) => setDraft(e.target.value)} className={cn(FIELD, "h-[30px] min-w-0 flex-1")} />
              <button type="button" className={BUTTON} disabled={draft.trim() === channel} onClick={() => void onSaveChannel(draft.trim())}>
                Save
              </button>
            </div>
          </StackRow>
          <button type="button" className={BUTTON} onClick={onSignout}>
            Sign out
          </button>
        </>
      ) : (
        <button
          type="button"
          className={BUTTON}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            const res = await onSignin();
            if (!res.ok) setError(res.error);
            setBusy(false);
          }}
        >
          Sign in with Twitch
        </button>
      )}
      {shown && <p className="text-[11px] text-ui-danger">{shown}</p>}
    </div>
  );
}
