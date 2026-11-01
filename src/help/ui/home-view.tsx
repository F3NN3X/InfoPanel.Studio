import { Search } from "lucide-react";
import { iconFor } from "../icons";
import { stripInline } from "../inline";
import type { HelpContent } from "../types";
import { SoonChip } from "./article-view";

/** The three cards of Start here. */
const START_IDS = ["welcome", "quickstart", "concepts"];
const START_GROUP = "Start here";

interface HomeViewProps {
  content: HelpContent;
  query: string;
  onQuery: (query: string) => void;
  onOpen: (article: string) => void;
  /** A query is typed: only the field stays, so it is the same field the user is typing in and keeps its focus. */
  searching?: boolean;
  /** The link that brought the reader here named an article that is not there. */
  missing?: boolean;
}

/** Help home: the search field, the three Start here cards, and a card per group of articles. */
export function HomeView({ content, query, onQuery, onOpen, searching = false, missing = false }: HomeViewProps) {
  const start = START_IDS.flatMap((id) => (content.articles[id] ? [content.articles[id]] : []));
  return (
    <div className={searching ? "mx-auto box-border flex max-w-[760px] flex-col px-8 pt-9" : "mx-auto box-border flex max-w-[880px] flex-col gap-10 px-8 pb-20 pt-12"}>
      <div className="flex flex-col gap-3.5">
        {!searching && (
          <>
            {missing && <p role="status" className="m-0 text-sm text-s-muted">That article isn’t here. Browse the topics.</p>}
            <h1 className="m-0 text-[30px] font-semibold tracking-[-0.02em]">How can we help?</h1>
            <p className="m-0 max-w-[600px] text-pretty text-sm leading-[1.55] text-s-muted">Every feature of InfoPanel Studio, explained. Search, or start with the basics below.</p>
          </>
        )}
        <div role="search" className="flex h-[46px] max-w-[600px] items-center gap-2.5 rounded-[11px] border border-s-input-line bg-[#141418] px-3.5">
          <Search className="h-5 w-5 shrink-0 text-s-dim" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            aria-label="Search help"
            placeholder={"Try “kiosk port”, “thresholds” or “import”"}
            className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] text-s-t1 outline-none placeholder:text-s-dim"
          />
        </div>
      </div>

      {!searching && start.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-xs font-medium text-s-muted">{START_GROUP}</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
            {start.map((a) => {
              const Icon = iconFor(a.icon);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onOpen(a.id)}
                  className="flex cursor-pointer flex-col gap-2.5 whitespace-normal rounded-xl border border-s-card-line bg-s-card p-[18px] text-left text-s-t1 hover:border-[#33333b] hover:bg-[#141418]"
                >
                  <div className="grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-s-accent/14 text-s-accent-text">
                    <Icon className="h-[19px] w-[19px]" strokeWidth={1.75} />
                  </div>
                  <span className="text-sm font-semibold">{a.title}</span>
                  <span className="text-pretty text-[12.5px] leading-normal text-s-muted">{stripInline(a.lede)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {!searching && (
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-xs font-medium text-s-muted">All topics</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
          {content.groups
            .filter((g) => g.label !== START_GROUP && g.articles.length > 0)
            .map((g) => (
              <div key={g.label} className="flex flex-col gap-0.5 rounded-xl border border-s-card-line bg-s-card px-2 pb-2.5 pt-4">
                <h3 className="m-0 px-2.5 pb-1.5 text-[13px] font-semibold">{g.label}</h3>
                {g.articles.map((a) => {
                  const Icon = iconFor(a.icon);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onOpen(a.id)}
                      className="flex cursor-pointer items-center gap-[9px] whitespace-normal rounded-[7px] border-0 bg-transparent px-2.5 py-1.5 text-left text-[13px] text-[#b4b4bd] hover:bg-s-nav-hover hover:text-s-t1"
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
      </section>
      )}
    </div>
  );
}
