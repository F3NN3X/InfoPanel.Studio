// The still copy of an animated page layer (motion-svg.ts): where the screen allows no motion (Effects Calm or Off, lite mode,
// reduced motion) the stage draws this instead of the moving file. The app reads the pack's own file from where it is already
// served (same origin, no new address), checks it again, cuts its animation (`svgStill`) and draws the rest as a data URL. A file
// that cannot be read or checked draws nothing, never the moving one.
import { useEffect, useState } from "react";
import { svgIssue, svgStill } from "./pack-safety";

const stills = new Map<string, Promise<string | undefined>>();

/** The still copy of the SVG at `url`, read once per URL (undefined: it could not be read, or it is not a pack SVG). */
export function stillOf(url: string): Promise<string | undefined> {
  let still = stills.get(url);
  if (!still) {
    still = fetch(url)
      .then((r) => (r.ok ? r.text() : undefined))
      .then((text) => (text !== undefined && !svgIssue(text) ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStill(text))}` : undefined))
      .catch(() => undefined);
    stills.set(url, still);
  }
  return still;
}

/** The still copies of `urls` as they are read (a URL missing from the result is still being read, or could not be). */
export function useStills(urls: readonly string[]): Readonly<Record<string, string>> {
  const [ready, setReady] = useState<Record<string, string>>({});
  const key = urls.join("\n");
  useEffect(() => {
    let live = true;
    for (const url of key ? key.split("\n") : []) {
      void stillOf(url).then((still) => {
        if (live && still) setReady((r) => (r[url] === still ? r : { ...r, [url]: still }));
      });
    }
    return () => {
      live = false;
    };
  }, [key]);
  return ready;
}
