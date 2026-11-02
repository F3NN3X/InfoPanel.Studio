import { SearchX, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTION_NAMES } from "@/settings/model/search";
import { iconFor } from "../icons";
import type { Hit } from "../search";

interface ResultsViewProps {
  query: string;
  hits: Hit[];
  onHit: (hit: Hit) => void;
  onHome: () => void;
}

/** The first hit is what Enter in the search box opens: marked with an outline and a hint. */
const FIRST = "outline outline-1 -outline-offset-1 outline-s-accent";
const CARD = "flex cursor-pointer gap-3 whitespace-normal rounded-[11px] border border-s-card-line bg-s-card px-4 py-3.5 text-left text-s-t1 hover:border-[#33333b] hover:bg-[#141418]";

/** The search results: help sections (with the matching words lit) and, in the desktop app, Settings rows. */
export function ResultsView({ query, hits, onHit, onHome }: ResultsViewProps) {
  return (
    <div className="mx-auto box-border flex max-w-[760px] flex-col gap-[18px] px-8 pb-20 pt-9">
      <div role="status" className="flex flex-col gap-1">
        <h1 className="m-0 text-[22px] font-semibold tracking-[-0.015em]">{hits.length ? `${hits.length} result${hits.length > 1 ? "s" : ""}` : "No results"}</h1>
        <p className="m-0 text-body text-s-muted">{`for “${query.trim()}”`}</p>
      </div>
      <div className="flex flex-col gap-2">
        {hits.map((hit, i) => {
          if (hit.kind === "settings") {
            return (
              <button key={`s-${i}`} type="button" onClick={() => onHit(hit)} className={cn(CARD, i === 0 && FIRST)}>
                <Settings className="mt-px h-[18px] w-[18px] shrink-0 text-s-dim" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-medium">
                    {hit.label}
                    <span className="font-normal text-s-dim">{`  ›  Settings › ${SECTION_NAMES[hit.section]}`}</span>
                  </span>
                  <span className="text-[11.5px] text-s-dim">Settings{i === 0 && " · Enter opens this"}</span>
                </span>
              </button>
            );
          }
          const Icon = iconFor(hit.icon);
          return (
            <button key={`h-${hit.article}-${hit.headingId ?? ""}`} type="button" onClick={() => onHit(hit)} className={cn(CARD, i === 0 && FIRST)}>
              <Icon className="mt-px h-[18px] w-[18px] shrink-0 text-s-dim" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-sm font-medium">
                  {hit.title}
                  {hit.heading && <span className="font-normal text-s-dim">{`  ›  ${hit.heading}`}</span>}
                </span>
                <span className="text-[12.5px] leading-normal text-[#9696a0]">
                  {hit.pre}
                  {hit.hit && <mark className="rounded-[3px] bg-s-accent/25 px-px text-s-t1">{hit.hit}</mark>}
                  {hit.post}
                </span>
                <span className="text-[11.5px] text-s-dim">{hit.group}{i === 0 && " · Enter opens this"}</span>
              </span>
            </button>
          );
        })}
      </div>
      {hits.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-s-input-line px-5 py-8 text-center">
          <SearchX className="h-7 w-7 text-s-faint" />
          <span className="max-w-[360px] text-body leading-normal text-s-muted">
            Try fewer or different words, or browse{" "}
            <button type="button" onClick={onHome} className="cursor-pointer border-0 bg-transparent p-0 text-body text-s-accent-text hover:text-s-t1">
              all topics
            </button>
            .
          </span>
        </div>
      )}
    </div>
  );
}
