import { useEffect, useState } from "react";
import { surfaceBox } from "@/components/widget-style";
import { checkFraming, type FrameCheck } from "@/lib/dashboard-server";
import { isTauri } from "@/lib/desktop";
import { chromeOf } from "@/modules/standard-settings";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, Icon, type ShellProps } from "./kit";
import { meta } from "./meta/WebPage";

export { meta };

export interface WebPageProps extends ShellProps {
  look?: ModuleSettings;
  url?: string;
}

/**
 * A URL ready for an iframe: YouTube watch / share / shorts / live links become the always-embeddable
 * `/embed/` form (the watch page and the homepage refuse to be framed); any other URL passes through.
 */
export function toEmbeddable(raw: string): string {
  const url = raw.trim();
  if (!url) return "";
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url; // not a parseable URL: hand it to the iframe as-is
  }
  const host = u.hostname.replace(/^www\./, "");
  if (host !== "youtube.com" && host !== "youtu.be" && !host.endsWith(".youtube.com")) return url;
  let id: string | undefined;
  if (host === "youtu.be") id = u.pathname.split("/").filter(Boolean)[0];
  else if (u.pathname === "/watch") id = u.searchParams.get("v") ?? undefined;
  else if (/^\/(shorts|live)\/.+/.test(u.pathname)) id = u.pathname.split("/").filter(Boolean)[1];
  return id ? `https://www.youtube.com/embed/${id}` : url;
}

/** The frame's own 1px edge, drawn over the page (an inset shadow on the root would be covered by it). */
const EDGE = { background: "transparent", fg: "inherit", ring: "rgba(255, 255, 255, 0.1)" };

const hostOf = (src: string): string => {
  try {
    return new URL(src).hostname.replace(/^www\./, "");
  } catch {
    return src;
  }
};

/** One server check per URL a page shows, however many zones or remounts ask. */
const checks = new Map<string, Promise<FrameCheck>>();

/**
 * Whether `src` refuses to be framed here. A browser can't be talked out of X-Frame-Options or `frame-ancestors`,
 * so it asks the server; the desktop app takes those headers off (src-tauri/src/unframe.rs) and never asks. The frame
 * shows meanwhile, and stays when the answer is allowed or unknown.
 */
function useFrameRefused(src: string): boolean {
  const [refused, setRefused] = useState<string | null>(null);
  useEffect(() => {
    if (!src || isTauri()) return;
    let live = true;
    let check = checks.get(src);
    if (!check) {
      check = checkFraming(src);
      checks.set(src, check);
    }
    void check.then((frame) => {
      if (live && frame === "refused") setRefused(src);
    });
    return () => {
      live = false;
    };
  }, [src]);
  return refused === src;
}

export default function WebPage(p: WebPageProps) {
  const url = (p.url ?? "").trim();
  const src = toEmbeddable(url);
  const refused = useFrameRefused(src);
  const chrome = p.look ? chromeOf(p.look) : undefined;
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Web Page"}
      icon="language"
      // the page draws at its own size; a zoom would enlarge it
      design={null}
      showHeader={false}
      bleed
      compactView="off"
      studio={{ label: "Web Page", value: src ? hostOf(src) : "No URL", sub: src, kind: "text", live: !!src }}
    >
      {() =>
        src && refused ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center text-[color:var(--w-muted)]">
            <Icon name="language" className="text-xl" />
            <span className="text-xs">{hostOf(src)} doesn't allow being shown inside another page.</span>
            <span className="text-xs">It shows in the InfoPanel Studio desktop app.</span>
          </div>
        ) : src ? (
          <div className="absolute inset-0">
            {/* key={src}: remount (and reload) the frame whenever the URL changes. */}
            <iframe
              key={src}
              src={src}
              title={url}
              className="h-full w-full border-0 bg-white"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
            />
            <div className="pointer-events-none absolute inset-0" style={{ boxShadow: surfaceBox(EDGE, chrome).boxShadow }} />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-[color:var(--w-muted)]">
            <Icon name="language" className="text-xl" />
            <span className="text-xs">Enter a URL in the inspector</span>
          </div>
        )
      }
    </Widget>
  );
}
