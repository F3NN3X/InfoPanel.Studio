import { surfaceBox } from "@/components/widget-style";
import { chromeOf } from "@/modules/standard-settings";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, Icon, type ShellProps, type WidgetMeta } from "./kit";

export const meta: WidgetMeta = {
  id: "WebPage",
  name: "Web Page",
  category: "Generic",
  icon: "language",
  prefixes: [],
  defaultSize: [6, 4],
  minSize: [4, 2],
  blurb: "A web page or video in a frame",
  tags: "web youtube iframe browser",
  description: "Embeds a web page or YouTube video in a frame that fills the zone.",
};

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

export default function WebPage(p: WebPageProps) {
  const url = (p.url ?? "").trim();
  const src = toEmbeddable(url);
  const chrome = p.look ? chromeOf(p.look) : undefined;
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Web Page"}
      icon="language"
      showHeader={false}
      bleed
      compactView="off"
      studio={{ label: "Web Page", value: src ? hostOf(src) : "No URL", sub: src, kind: "text", live: !!src }}
    >
      {() =>
        src ? (
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
