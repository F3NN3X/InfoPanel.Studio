/**
 * The gallery's live thumbnails: a template made for the size and drawn offscreen by the full renderer (`ProfilePage`,
 * the widgets with this machine's data), captured once as a small picture (`captureShot`, what Screens' cards use) and
 * kept for the session, one per template, palette and size. A card asks for its picture when it comes into view (`useTemplateShot`); at most two are drawn
 * at a time (`thumb-queue.ts`). Until it arrives the card shows the plan of the template's zones.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSensorCatalog } from "@/lib/catalog";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import { defaultConfig } from "@/lib/layout";
import { captureShot } from "@/lib/profile-shot";
import { instantiate } from "@/lib/screen-templates/instantiate";
import type { ScreenTemplate } from "@/lib/screen-templates/kit";
import { ProfilePage } from "../studio/profile-page";
import { createThumbQueue } from "./thumb-queue";

interface ShotSpec {
  template: ScreenTemplate;
  variant: string;
  width: number;
  height: number;
}

/** How many are drawn at once, and how long a page gets to run its first draws before it is captured. */
const AT_ONCE = 2;
const WARMUP_MS = 700;
const GIVE_UP_MS = 15000;

const queue = createThumbQueue<ShotSpec>(AT_ONCE);
const keyOf = (t: ScreenTemplate, variant: string, width: number, height: number) => `${t.id}:${variant}:${width}x${height}`;

/** The card's picture, or undefined until it is taken; asks for it while `visible`. */
export function useTemplateShot(template: ScreenTemplate, variant: string, width: number, height: number, visible: boolean): string | undefined {
  const key = keyOf(template, variant, width, height);
  useSyncExternalStore(queue.subscribe, queue.version);
  useEffect(() => (visible ? queue.want(key, { template, variant, width, height }) : undefined), [visible, key]);
  return queue.get(key);
}

/** Whether the element is on screen (it stays so once seen: the picture is kept anyway). */
export function useSeen<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setSeen(true));
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

function ShotJob({ id, spec }: { id: string; spec: ShotSpec }) {
  const host = useRef<HTMLDivElement>(null);
  const catalog = useSensorCatalog();
  const profile = useMemo(
    () => instantiate(spec.template, { name: spec.template.name, variant: spec.variant, width: spec.width, height: spec.height, sensors: catalog.sensors as unknown as Record<string, DataApiValue> }).profile,
    [spec, catalog.sensors],
  );
  const dashboard = useMemo(() => defaultConfig(), []);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => !cancelled && queue.fail(id), GIVE_UP_MS);
    const run = async () => {
      await new Promise((r) => setTimeout(r, WARMUP_MS));
      await document.fonts.ready;
      const page = host.current?.firstElementChild as HTMLElement | null;
      if (cancelled || !page) return;
      const picture = await captureShot(page);
      if (!cancelled) queue.done(id, picture);
    };
    run().catch(() => !cancelled && queue.fail(id));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);
  return (
    <div ref={host} aria-hidden {...{ inert: true }} className="pointer-events-none" style={{ position: "fixed", left: -100000, top: 0 }}>
      <ProfilePage profile={profile} dashboard={dashboard} />
    </div>
  );
}

/** Draws the thumbnails being taken, offscreen; the gallery renders one. */
export function TemplateShotHost() {
  useSyncExternalStore(queue.subscribe, queue.version);
  return (
    <>
      {queue.active().map(([id, spec]) => (
        <ShotJob key={id} id={id} spec={spec} />
      ))}
    </>
  );
}
