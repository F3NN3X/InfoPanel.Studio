import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import { captureShot } from "@/lib/profile-shot";
import { profileRev } from "@/lib/profile-shot-cache";
import { ProfilePage } from "./profile-page";
import { pruneProfileShots, setShot, useShots } from "./profile-shot-store";

/** Edits hold still this long before the edited page is captured. */
const SETTLE_MS = 2000;
/** The offscreen page gets this long to run its first draws (fonts and images are awaited as well). */
const WARMUP_MS = 1500;
const RETRY_MS = 500;
/** After this many tries the canvas is not there (Sources view): the background job takes the profile. */
const MAX_RETRIES = 10;
/** A background job (draw, decode, fetch, capture) gets this long before it is given up. */
const JOB_TIMEOUT_MS = 20000;

/** Run `fn` when the browser is idle (a timer where there is no idle callback). Returns the cancel. */
function whenIdle(fn: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(fn, { timeout: 5000 });
    return () => cancelIdleCallback(handle);
  }
  const timer = setTimeout(fn, 200);
  return () => clearTimeout(timer);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The offscreen page is ready: fonts loaded, images decoded. */
async function settled(host: HTMLElement): Promise<void> {
  await sleep(WARMUP_MS);
  await document.fonts.ready;
  await Promise.all([...host.querySelectorAll("img")].map((img) => img.decode().catch(() => {})));
}

interface ShotJobProps {
  profile: MonitorProfile;
  dashboard: DashboardConfig;
  rev: string;
  profileIds: readonly string[];
  /** Done, or given up (the profile is then not tried again at this rev). */
  onDone: (ok: boolean) => void;
}

/** One profile's first page, drawn offscreen by the full renderer until it is captured. */
function ShotJob({ profile, dashboard, rev, profileIds, onDone }: ShotJobProps) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await settled(host.current!);
      const page = host.current!.firstElementChild as HTMLElement;
      if (cancelled) return;
      const shot = await captureShot(page);
      // A capture that finishes after the timeout (or an unmount) is dropped.
      if (!cancelled) setShot(profile.id, rev, shot, profileIds);
    };
    // A hung decode or fetch must not hold the queue (and the offscreen widgets) for good.
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("shot timed out")), JOB_TIMEOUT_MS);
    });
    void Promise.race([run(), timeout]).then(
      () => !cancelled && onDone(true),
      () => !cancelled && onDone(false)
    ).finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  return (
    <div
      ref={host}
      aria-hidden
      {...{ inert: true }}
      className="pointer-events-none"
      style={{ position: "fixed", left: -100000, top: 0 }}
    >
      <ProfilePage profile={profile} dashboard={dashboard} />
    </div>
  );
}

interface ProfileShotsProps {
  profiles: MonitorProfile[];
  dashboard: DashboardConfig;
  /** The profile being edited. */
  editedId: string;
  /** The studio canvas shows the edited profile's first page: its shot is taken from the canvas itself. */
  canvasIsFirstPage: boolean;
  /** The canvas' scroll area, which holds the page element. */
  scrollRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  /** Edits the server does not have yet; a save (it going false) takes the shot at once. */
  pushPending: boolean;
}

/**
 * Keeps the profile screenshots current. The edited profile is captured from the studio canvas once edits
 * have settled (2 s) and on save; every other profile without a current shot is drawn offscreen, one
 * at a time when the browser is idle. Renders nothing but the one offscreen page.
 */
export function ProfileShots({ profiles, dashboard, editedId, canvasIsFirstPage, scrollRef, zoom, pushPending }: ProfileShotsProps) {
  const shots = useShots();
  const profileIds = useMemo(() => profiles.map((p) => p.id), [profiles]);
  const revs = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.id, profileRev(p, dashboard)])),
    [profiles, dashboard.general?.clock]
  );
  const [job, setJob] = useState<{ profile: MonitorProfile; rev: string } | null>(null);
  /** `id:rev` of the shots that could not be taken, so they are not retried in a loop. */
  const failed = useRef(new Set<string>());

  useEffect(() => pruneProfileShots(profileIds), [profileIds]);

  // The edited page, from the canvas: not while a move / resize / draw is in flight.
  const latest = useRef({ editedId, rev: revs[editedId], zoom, profileIds });
  latest.current = { editedId, rev: revs[editedId], zoom, profileIds };
  /** The rev being captured from the canvas, so the save and the settle timer do not both take it. */
  const capturing = useRef<string | null>(null);
  const captureCanvas = async (): Promise<boolean> => {
    const page = scrollRef.current?.querySelector<HTMLElement>("[data-studio-page]");
    if (!page || page.hasAttribute("data-dragging")) return false;
    const { editedId: id, rev, zoom: z, profileIds: ids } = latest.current;
    if (capturing.current === rev) return true;
    capturing.current = rev;
    try {
      setShot(id, rev, await captureShot(page, z), ids);
    } catch {
      // Keep the shot it has.
    } finally {
      capturing.current = null;
    }
    return true;
  };
  const upToDate = shots[editedId]?.rev === revs[editedId];
  /** The edited rev the canvas could not be captured for (no page, e.g. the Sources view): the offscreen job takes it. */
  const [gaveUp, setGaveUp] = useState<string | null>(null);
  useEffect(() => {
    if (!canvasIsFirstPage || upToDate) return;
    let cancelIdle = () => {};
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;
    const attempt = () => {
      cancelIdle = whenIdle(() => {
        void captureCanvas().then((taken) => {
          if (taken) return;
          if (++tries < MAX_RETRIES) timer = setTimeout(attempt, RETRY_MS);
          else setGaveUp(latest.current.rev);
        });
      });
    };
    timer = setTimeout(attempt, SETTLE_MS);
    return () => {
      clearTimeout(timer);
      cancelIdle();
    };
  }, [canvasIsFirstPage, upToDate, revs[editedId]]);

  const wasPending = useRef(pushPending);
  useEffect(() => {
    const saved = wasPending.current && !pushPending && canvasIsFirstPage && !upToDate;
    wasPending.current = pushPending;
    if (saved) return whenIdle(() => void captureCanvas());
  }, [pushPending]);

  // The other profiles (and the edited one without any shot, or off its first page), one at a time.
  const next = job
    ? undefined
    : profiles.find(
        (p) =>
          shots[p.id]?.rev !== revs[p.id] &&
          !failed.current.has(`${p.id}:${revs[p.id]}`) &&
          !(p.id === editedId && canvasIsFirstPage && shots[p.id] && gaveUp !== revs[p.id])
      );
  useEffect(() => {
    if (!next) return;
    let cancelIdle = () => {};
    // The edited profile settles first: it is still changing.
    const timer = setTimeout(() => (cancelIdle = whenIdle(() => setJob({ profile: next, rev: revs[next.id] }))), next.id === editedId ? SETTLE_MS : 0);
    return () => {
      clearTimeout(timer);
      cancelIdle();
    };
  }, [next, revs[next?.id ?? ""]]);

  if (!job) return null;
  return (
    <ShotJob
      key={`${job.profile.id}:${job.rev}`}
      profile={job.profile}
      dashboard={dashboard}
      rev={job.rev}
      profileIds={profileIds}
      onDone={(ok) => {
        if (!ok) failed.current.add(`${job.profile.id}:${job.rev}`);
        setJob(null);
      }}
    />
  );
}
