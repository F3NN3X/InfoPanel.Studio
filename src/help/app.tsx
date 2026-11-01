import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TitleBar } from "@/app-window/title-bar";
import { useZoomKeys } from "@/app-window/zoom";
import { ipc, onEvent } from "@/settings/ipc";
import { SEARCH_INDEX } from "@/settings/model/search";
import { HELP } from "./content";
import { reportFailure, setFailureHandler, useEnv } from "./env";
import { helpPageUrl, parseHelpHash, type HelpTarget } from "./links";
import { buildIndex, searchHelp, type Hit } from "./search";
import type { HelpContent } from "./types";
import { ArticleView } from "./ui/article-view";
import { HomeView } from "./ui/home-view";
import { ResultsView } from "./ui/results-view";
import { Sidebar } from "./ui/sidebar";

/** The TOC rail needs this much room in the main pane. */
const TOC_MIN_WIDTH = 1000;
/** A heading is the current one once its top is within this of the top of the pane. */
const SPY_OFFSET = 80;
/** A heading opened by a link or the TOC sits this far below the top. */
const SCROLL_MARGIN = 20;

interface Route {
  article: string | null;
  heading: string | null;
  /** Bumped by every open, so opening the same article again still scrolls. */
  seq: number;
}

/** Zoom keys, and the version, of the desktop window. */
function useDesktopInfo(enabled: boolean) {
  const [version, setVersion] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  useEffect(() => {
    if (!enabled) return;
    void ipc.appInfo().then((info) => setVersion(info.version)).catch(() => {});
    // Settings can change the zoom while Help is open: re-read it when the window regains focus.
    const syncZoom = () => void ipc.getSettings().then((s) => setZoom(s.zoom)).catch(() => {});
    syncZoom();
    window.addEventListener("focus", syncZoom);
    return () => window.removeEventListener("focus", syncZoom);
  }, [enabled]);
  const changeZoom = useCallback(async (percent: number) => {
    setZoom(percent);
    await ipc.setZoom(percent / 100).catch(reportFailure);
  }, []);
  return { version, zoom, changeZoom };
}

function ZoomKeys({ zoom, setZoom }: { zoom: number; setZoom: (percent: number) => Promise<void> }) {
  useZoomKeys(zoom, setZoom);
  return null;
}

interface HelpAppProps {
  content?: HelpContent;
}

/** The Help window: sidebar, and Home, search results or one article in the main pane. */
export function HelpApp({ content = HELP }: HelpAppProps) {
  const env = useEnv();
  const main = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const off = setFailureHandler((message) => {
      clearTimeout(timer);
      setFailure(message);
      timer = setTimeout(() => setFailure(null), 4500);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);
  const [route, setRoute] = useState<Route>(() => toRoute(parseHelpHash(window.location.hash), content, 0));
  const routeRef = useRef(route);
  routeRef.current = route;
  const [active, setActive] = useState<string | null>(null);
  const [mainWidth, setMainWidth] = useState(0);
  const { version, zoom, changeZoom } = useDesktopInfo(env.desktop);

  const index = useMemo(() => buildIndex(content), [content]);
  const hits = useMemo(() => searchHelp(query, content, index, env.desktop ? SEARCH_INDEX : []), [query, content, index, env.desktop]);
  const searching = query.trim() !== "";
  const article = route.article ? content.articles[route.article] : undefined;

  const open = useCallback(
    (target: HelpTarget) => {
      setQuery("");
      const next = toRoute(target, content, 0);
      setRoute((r) => ({ ...next, seq: r.seq + 1 }));
      window.history.replaceState(null, "", helpPageUrl({ article: next.article ?? undefined, heading: next.heading ?? undefined }));
    },
    [content]
  );
  const openArticle = useCallback((id: string, heading?: string) => open({ article: id, heading }), [open]);
  const goHome = useCallback(() => open({}), [open]);

  // Another window (or a link to this page) asks for an article.
  useEffect(() => {
    const onHash = () => {
      // A hash change that names the page already shown (a late event for the page's own address) is not a navigation:
      // opening it again would clear the search the user is typing.
      const next = toRoute(parseHelpHash(window.location.hash), content, 0);
      const now = routeRef.current;
      if (next.article === now.article && next.heading === now.heading) return;
      open(parseHelpHash(window.location.hash));
    };
    window.addEventListener("hashchange", onHash);
    let alive = true;
    let off: (() => void) | undefined;
    if (env.desktop) {
      void onEvent<HelpTarget>("help-open", (target) => alive && open(target)).then((u) => (alive ? (off = u) : u()));
    }
    return () => {
      alive = false;
      off?.();
      window.removeEventListener("hashchange", onHash);
    };
  }, [env.desktop, open, content]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && query) setQuery("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [query]);

  useEffect(() => {
    const el = main.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setMainWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A new article starts at the top, or at its heading; scrolling happens inside the pane, never on the window.
  useLayoutEffect(() => {
    const pane = main.current;
    if (!pane || !article) return;
    const heading = route.heading ? findHeading(pane, route.heading) : null;
    pane.scrollTop = heading ? heading.offsetTop - SCROLL_MARGIN : 0;
    setActive(heading ? route.heading : null);
  }, [route.seq]);

  // Leaving the results (Escape) puts the article back at the top, unless an open just scrolled it to a heading.
  const wasSearching = useRef(searching);
  const lastSeq = useRef(route.seq);
  useLayoutEffect(() => {
    if (wasSearching.current && !searching && lastSeq.current === route.seq && main.current) main.current.scrollTop = 0;
    wasSearching.current = searching;
    lastSeq.current = route.seq;
  });

  const onScroll = () => {
    const pane = main.current;
    if (!pane || !article || searching) return;
    let current: string | null = null;
    pane.querySelectorAll<HTMLElement>("[data-hid]").forEach((h) => {
      if (h.offsetTop - SPY_OFFSET <= pane.scrollTop) current = h.dataset.hid ?? null;
    });
    if (current !== active) setActive(current);
  };

  const toc = (id: string) => {
    const pane = main.current;
    const heading = pane && findHeading(pane, id);
    if (pane && heading) pane.scrollTop = heading.offsetTop - SCROLL_MARGIN;
    setActive(id);
  };

  const openHit = (hit: Hit) => {
    if (hit.kind === "settings") env.openSettings(hit.section);
    else open({ article: hit.article, heading: hit.headingId ?? undefined });
  };

  const headings = article?.blocks.filter((b) => b.type === "h").length ?? 0;
  const showToc = headings > 1 && mainWidth >= TOC_MIN_WIDTH;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-s-win">
      {env.desktop && <TitleBar title={"InfoPanel Studio — Help"} />}
      {env.desktop && <ZoomKeys zoom={zoom} setZoom={changeZoom} />}
      <div className="flex min-h-0 flex-1">
        <Sidebar
          content={content}
          inputRef={search}
          current={article?.id ?? null}
          query={query}
          version={version}
          onQuery={setQuery}
          onSubmit={() => hits[0] && openHit(hits[0])}
          onHome={goHome}
          onOpen={openArticle}
        />
        <main ref={main} onScroll={onScroll} className="relative min-w-0 flex-1 overflow-auto">
          {article && !searching ? (
            <ArticleView article={article} content={content} showToc={showToc} active={active} onOpen={openArticle} onHome={goHome} onToc={toc} />
          ) : (
            <>
              {/* Typed on Home: its field stays mounted under the results, so focus and the caret stay put. */}
              {!article && <HomeView content={content} query={query} onQuery={setQuery} onOpen={openArticle} searching={searching} />}
              {searching && <ResultsView query={query} hits={hits} onHit={openHit} onHome={goHome} />}
            </>
          )}
        </main>
      </div>
      {failure && (
        <div role="alert" className="fixed bottom-4 left-1/2 z-50 max-w-[min(480px,calc(100vw-32px))] -translate-x-1/2 rounded-lg border border-s-card-line bg-s-card px-3.5 py-2.5 text-[12.5px] text-s-red shadow-lg">
          {failure}
        </div>
      )}
    </div>
  );
}

/** A heading of the pane by id; compared, not put in a selector, since the id can come from a link. */
function findHeading(pane: HTMLElement, id: string): HTMLElement | null {
  return Array.from(pane.querySelectorAll<HTMLElement>("[data-hid]")).find((h) => h.dataset.hid === id) ?? null;
}

/** The route for a target; an unknown article is Help home, an unknown heading is the top of the article. */
function toRoute(target: HelpTarget, content: HelpContent, seq: number): Route {
  const article = target.article !== undefined && Object.hasOwn(content.articles, target.article) ? content.articles[target.article] : null;
  const heading = article?.blocks.some((b) => b.type === "h" && b.id === target.heading) ? (target.heading ?? null) : null;
  return { article: article?.id ?? null, heading, seq };
}
