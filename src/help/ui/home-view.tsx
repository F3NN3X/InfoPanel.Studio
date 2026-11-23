import { ArrowRight, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { iconFor } from "../icons";
import { stripInline } from "../inline";
import { HELP_TASKS } from "../tasks";
import type { HelpContent } from "../types";
import { SoonChip } from "./article-view";

/** The three cards of Start here. */
const START_IDS = ["welcome", "quickstart", "concepts"];
const START_GROUP = "Start here";

interface HomeViewProps {
  content: HelpContent;
  query: string;
  onQuery: (query: string) => void;
  onOpen: (article: string, heading?: string) => void;
  /** A query is typed: only the field stays, so it is the same field the user is typing in and keeps its focus. */
  searching?: boolean;
  /** The link that brought the reader here named an article that is not there. */
  missing?: boolean;
}

/** Help home: the search field, the three Start here cards, the task cards, and every topic behind a disclosure. */
export function HomeView({ content, query, onQuery, onOpen, searching = false, missing = false }: HomeViewProps) {
  const start = START_IDS.flatMap((id) => (content.articles[id] ? [content.articles[id]] : []));
  return (
    <div className={searching ? "mx-auto box-border flex max-w-190 flex-col px-8" : "mx-auto box-border flex max-w-220 flex-col gap-10 px-8 pb-20 pt-12"}>
      <div className="flex flex-col gap-3.5">
        {!searching && (
          <>
            {missing && <p role="status" className="m-0 text-lead text-s-muted">That article isn’t here. Browse the topics.</p>}
            <h1 className="m-0 text-[30px] font-medium">How can we help?</h1>
            <p className="m-0 max-w-150 text-pretty text-lead leading-[1.55] text-s-muted">Every feature of InfoPanel Studio, explained. Search, or start with the basics below.</p>
          </>
        )}
        {/* Typed on Home the field stays (it keeps focus and the caret) and the sidebar's is the one in view; the results are what shows. */}
        <div className={cn(searching && "sr-only focus-within:not-sr-only focus-within:pt-9")}>
          <div role="search" className="flex h-11.5 max-w-150 items-center gap-2.5 rounded-ui-lg border border-s-input-line bg-s-tile px-3.5 focus-within:border-s-accent focus-within:ring-1 focus-within:ring-s-accent forced-colors:focus-within:outline forced-colors:focus-within:outline-2">
            <Search className="h-5 w-5 shrink-0 text-s-dim" />
            <input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              aria-label="Search help"
              placeholder={"Try “kiosk port”, “thresholds” or “import”"}
              className="min-w-0 flex-1 border-0 bg-transparent text-lead text-s-t1 outline-none! placeholder:text-s-dim"
            />
          </div>
        </div>
      </div>

      {!searching && start.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-caption font-medium text-s-muted">{START_GROUP}</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
            {start.map((a) => {
              const Icon = iconFor(a.icon);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onOpen(a.id)}
                  className="flex cursor-pointer flex-col gap-2.5 whitespace-normal rounded-xl border border-s-card-line bg-s-card p-4.5 text-left text-s-t1 hover:border-s-card-hover hover:bg-s-tile"
                >
                  <div className="grid h-8 w-8 place-items-center rounded-ui-menu bg-s-accent/14 text-s-accent-text">
                    <Icon className="h-4.75 w-4.75" strokeWidth={1.75} />
                  </div>
                  <span className="text-lead font-medium">{a.title}</span>
                  <span className="text-pretty text-body leading-normal text-s-muted">{stripInline(a.lede)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {!searching && (
        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-caption font-medium text-s-muted">Common tasks</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
            {HELP_TASKS.flatMap((t) => {
              const article = content.articles[t.article];
              if (!article) return [];
              const Icon = iconFor(article.icon);
              return [
                <button
                  key={t.title}
                  type="button"
                  onClick={() => onOpen(t.article, t.heading)}
                  className="group flex cursor-pointer items-center gap-3 whitespace-normal rounded-xl border border-s-card-line bg-s-card p-3.5 text-left text-s-t1 hover:border-s-card-hover hover:bg-s-tile"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-ui-menu bg-s-accent/14 text-s-accent-text">
                    <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-lead font-medium">{t.title}</span>
                    <span className="text-pretty text-caption text-s-muted">{article.title}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-s-faint group-hover:text-s-t2" />
                </button>,
              ];
            })}
          </div>
        </section>
      )}

      {!searching && (
        // Its own section, so the topics' h3s sit under an h2 of their own, not under "Common tasks"; it keeps the tight gap the disclosure had.
        <section className="-mt-7" aria-labelledby="help-all-topics">
          <h2 id="help-all-topics" className="sr-only">
            Browse every topic
          </h2>
          {/* The sidebar lists every topic, but it is icons only in a narrow window: the whole list stays one click away here. */}
          <details className="group mt-2">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-md py-1 text-caption text-s-muted hover:text-s-t1">
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
              All topics
            </summary>
            <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
              {content.groups
                .filter((g) => g.label !== START_GROUP && g.articles.length > 0)
                .map((g) => (
                  <div key={g.label} className="flex flex-col gap-0.5 rounded-xl border border-s-card-line bg-s-card px-2 pb-2.5 pt-4">
                    <h3 className="m-0 px-2.5 pb-1.5 text-body font-medium">{g.label}</h3>
                    {g.articles.map((a) => {
                      const Icon = iconFor(a.icon);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => onOpen(a.id)}
                          className="flex cursor-pointer items-center gap-2.25 whitespace-normal rounded-ui-md border-0 bg-transparent px-2.5 py-1.5 text-left text-body text-s-body hover:bg-s-nav-hover hover:text-s-t1"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-s-dim" />
                          <span className="flex-1">{a.title}</span>
                          {a.status === "coming-soon" && <SoonChip />}
                        </button>
                      );
                    })}
                  </div>
                ))}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
