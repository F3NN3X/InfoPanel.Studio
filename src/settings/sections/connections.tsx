import { useEffect, useState, type ReactNode } from "react";
import { CalendarBlock } from "@/components/connections/calendar-block";
import { ObsBlock } from "@/components/connections/obs-block";
import { StreamDeckBlock } from "@/components/connections/streamdeck-block";
import { TwitchBlock } from "@/components/connections/twitch-block";
import { YoutubeBlock } from "@/components/connections/youtube-block";
import { pageEnv } from "@/help/env";
import { EMPTY_TWITCH, EMPTY_YOUTUBE } from "@/lib/extras";
import { fetchIntegrations, saveIntegrations, type IntegrationsPatch, type PublicIntegrations } from "@/lib/integrations";
import { cn } from "@/lib/utils";
import { twitchSignin, twitchSignout, useTwitchPending } from "@/lib/twitch";
import { deckAct, useStreamDeck, useStreamDeckLink } from "@/lib/streamdeck";
import { youtubeSignin, youtubeSignout, useYoutubePending } from "@/lib/youtube";
import { useExtras } from "@/widgets/time-hooks";
import { useFound } from "../store";
import { Group } from "../ui";

/** A connection's card; `id` is the row search jumps to. */
function ConnectionCard({ id, children }: { id: string; children: ReactNode }) {
  const found = useFound(id);
  return (
    <div ref={found.ref} className={cn("rounded-xl border border-s-card-line bg-s-card px-[18px] py-4", found.className)}>
      {children}
    </div>
  );
}

/**
 * Settings › Connections: the accounts and apps the dashboard server talks to. They are not part of the dashboard
 * config: the server keeps them in their own file, secrets are sent once and never shown again, and each block saves
 * with its own button (no auto-save). The page is served by the Studio's server, so it reaches `/api/integrations`
 * and the Twitch routes directly.
 */
export function ConnectionsSection() {
  const [stored, setStored] = useState<PublicIntegrations | null>(null);
  const [error, setError] = useState("");
  const twitch = useExtras().twitch ?? EMPTY_TWITCH;
  const pending = useTwitchPending(twitch.pending);
  const youtube = useExtras().youtube ?? EMPTY_YOUTUBE;
  const youtubePending = useYoutubePending(youtube.pending);
  const streamDeck = useStreamDeck();
  const streamDeckLink = useStreamDeckLink();
  useEffect(() => {
    let alive = true;
    fetchIntegrations()
      .then((s) => alive && setStored(s))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);
  const save = async (patch: IntegrationsPatch) => {
    try {
      setStored(await saveIntegrations(patch));
      setError("");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  if (!stored) return error ? <p className="m-0 text-[12.5px] text-s-red">{error}</p> : null;
  return (
    <>
      <Group title="OBS">
        <ConnectionCard id="obs">
          <ObsBlock stored={stored.obs} streaming={stored.streaming?.obs} onSave={save} />
        </ConnectionCard>
      </Group>
      <Group title="Twitch">
        <ConnectionCard id="twitch">
          <TwitchBlock
            state={twitch}
            pending={pending}
            channel={stored.streaming?.twitch?.channel ?? ""}
            onSignin={twitchSignin}
            onCancel={() => void twitchSignout()}
            onSignout={() => void twitchSignout()}
            onSaveChannel={(channel) => save({ streaming: { twitch: { channel } } })}
            onOpen={pageEnv().openExternal}
          />
        </ConnectionCard>
      </Group>
      <Group title="YouTube">
        <ConnectionCard id="youtube">
          <YoutubeBlock
            state={youtube}
            clientConfigured={stored.streaming?.youtube?.clientConfigured ?? false}
            chatInterval={stored.streaming?.youtube?.chatInterval ?? 10}
            pending={youtubePending}
            onSaveClient={(clientId, clientSecret) => save({ streaming: { youtube: { ...(clientId ? { client_id: clientId } : {}), ...(clientSecret ? { client_secret: clientSecret } : {}) } } })}
            onSaveInterval={(seconds) => save({ streaming: { youtube: { chat_interval: seconds } } })}
            onSignin={youtubeSignin}
            onCancel={() => void youtubeSignout()}
            onSignout={() => void youtubeSignout()}
            onOpen={pageEnv().openExternal}
          />
        </ConnectionCard>
      </Group>
      <Group title="Stream Deck">
        <ConnectionCard id="streamdeck">
          <StreamDeckBlock state={streamDeck} link={streamDeckLink} act={deckAct} onEnable={(enabled) => save({ streaming: { streamdeck: { enabled } } })} />
        </ConnectionCard>
      </Group>
      <Group title="Calendar">
        <ConnectionCard id="calendar">
          <CalendarBlock stored={stored.calendar.links} onSave={(links) => save({ calendar: { links } })} />
        </ConnectionCard>
      </Group>
      {error && <p className="m-0 text-[12.5px] text-s-red">{error}</p>}
    </>
  );
}
