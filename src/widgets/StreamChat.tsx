import { useState, type SubmitEvent } from "react";
import { chatRefusal, chatSend, useChat, type ChatBadge, type ChatPlatform } from "@/lib/chat";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, fmt, Icon, Chip, Dot, Empty, hue, STATE, type ShellProps } from "./kit";
import { canSend, mentions, mergeChat, nameHue, platformsOf, sendTarget, type ChatSource } from "./StreamChat/merge";
import { useExtras } from "./time-hooks";
import { meta } from "./meta/StreamChat";

export { meta };

export interface StreamChatProps extends ShellProps {
  look?: ModuleSettings;
  /** Which chats to show (default Twitch). */
  source?: ChatSource;
  /** Where a typed message goes when the source is both (default Twitch). */
  sendTo?: ChatPlatform;
  /** Messages naming `@name` are tinted; default the signed-in Twitch login. */
  highlight?: string;
  /** The send box (default on); it shows only while sending can work. */
  showInput?: boolean;
  textSize?: "sm" | "md" | "lg";
  /** How many of the latest messages (default 60). */
  maxMessages?: number;
  /** Name colours: the platform's own (default) or ones turned from the accent. */
  nameColors?: "platform" | "accent";
}

const BADGE_COLOR: Record<Exclude<ChatBadge, "">, string> = { mod: STATE.ok, vip: STATE.warn, broadcaster: STATE.crit, sub: "var(--accent)" };
const TAG: Record<ChatPlatform, string> = { twitch: "TW", youtube: "YT" };
const TITLE: Record<ChatSource, string> = { twitch: "Twitch chat", youtube: "YouTube chat", both: "Stream chat" };

export default function StreamChat(p: StreamChatProps) {
  const chat = useChat();
  const { twitch, youtube } = useExtras();
  const readOnly = chatRefusal.use();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const source = p.source ?? "twitch";
  const msgs = mergeChat(chat.messages, source, p.maxMessages ?? 60);
  const from = platformsOf(source);
  const viewers = (from.includes("twitch") && twitch?.signedIn ? twitch.viewers : 0) + (from.includes("youtube") && youtube?.signedIn ? youtube.viewers : 0);
  const live = (from.includes("twitch") && twitch?.live === true) || (from.includes("youtube") && youtube?.live === true);
  const target = sendTarget(source, p.sendTo);
  const sending = canSend({ enabled: p.showInput !== false, refused: readOnly, target, twitch, youtube, chat });
  const highlight = p.highlight?.trim() || (source === "youtube" ? youtube?.channel : twitch?.login) || "";
  const signedIn = (from.includes("twitch") && twitch?.signedIn === true) || (from.includes("youtube") && youtube?.signedIn === true);
  const title = p.title ?? TITLE[source];
  const last = msgs[msgs.length - 1];
  const send = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const res = await chatSend(target, text);
    if (res.ok) {
      setDraft("");
      setError("");
    } else setError(res.message);
  };
  return (
    <Widget
      {...shell(p)}
      title={title}
      icon="forum"
      right={
        <Chip>
          <Dot ok={live} />
          {fmt(viewers)} watching
        </Chip>
      }
      compact={{ label: title, value: viewers, sub: last ? `${last.user}: ${last.text}` : "No messages", icon: "forum", kind: "value" }}
    >
      {({ size }) => {
        const fs = p.textSize === "lg" ? 15.5 : p.textSize === "sm" ? 12 : size === "lg" ? 14.5 : 13;
        return (
          <div className="flex h-full min-h-0 flex-col gap-2">
            {!msgs.length ? (
              <div className="min-h-0 flex-1">
                <Empty icon="forum" label={signedIn ? "No messages yet" : `Sign in to ${source === "youtube" ? "YouTube" : "Twitch"} in Settings › Connections`} />
              </div>
            ) : (
              // Newest at the bottom; older lines clip off the top instead of overflowing.
              <div className="flex min-h-0 flex-1 flex-col justify-end gap-[3px] overflow-hidden">
                {msgs.map((m) => (
                  <div
                    key={m.id}
                    className="shrink-0 break-words rounded-md px-1.5 py-[1px] leading-snug"
                    data-mention={mentions(m.text, highlight) || undefined}
                    style={{ fontSize: fs, background: mentions(m.text, highlight) ? "color-mix(in oklab, var(--accent) 14%, transparent)" : undefined }}
                  >
                    {m.badge && <span role="img" aria-label={m.badge} title={m.badge} className="mr-1.5 inline-block h-[0.8em] w-[0.8em] rounded-[3px] align-[-0.05em]" style={{ background: BADGE_COLOR[m.badge] }} />}
                    {source === "both" && <span className="mr-1.5 rounded bg-white/[0.08] px-1 align-[0.1em] text-[0.68em] font-semibold text-zinc-400">{TAG[m.platform]}</span>}
                    <span className="font-semibold" style={{ color: (p.nameColors !== "accent" && m.color) || hue(nameHue(m.user)) }}>
                      {m.user}
                    </span>
                    <span className="text-zinc-200"> {m.text}</span>
                  </div>
                ))}
              </div>
            )}
            {sending && (
              <form onSubmit={(e) => void send(e)} className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-white/[0.05] pl-3 pr-1">
                <input
                  value={draft}
                  maxLength={target === "youtube" ? 200 : 500}
                  aria-label="Chat message"
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={error || (source === "both" ? `Send to ${target === "youtube" ? "YouTube" : "Twitch"}` : "Send a message")}
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-500"
                />
                <button type="submit" aria-label="Send" disabled={!draft.trim()} className="flex h-7 w-7 items-center justify-center rounded-md disabled:opacity-40" style={{ color: "var(--accent)" }}>
                  <Icon name="send" className="text-[18px]" />
                </button>
              </form>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
