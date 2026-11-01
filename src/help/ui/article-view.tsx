import { ArrowLeft, ArrowRight, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { iconFor } from "../icons";
import { stripInline } from "../inline";
import type { Article, HelpContent } from "../types";
import { BlockView } from "./blocks";
import { InlineText } from "./inline-text";

interface ArticleViewProps {
  article: Article;
  content: HelpContent;
  /** The "On this page" rail: 2 or more headings and a wide enough pane. */
  showToc: boolean;
  /** The heading the scroll is at (the TOC lights it). */
  active: string | null;
  onOpen: (article: string, heading?: string) => void;
  onHome: () => void;
  onToc: (headingId: string) => void;
}

/** The "Coming soon" chip of an article that is not shipped yet. */
export function SoonChip({ className }: { className?: string }) {
  return (
    <span className={cn("shrink-0 whitespace-nowrap rounded-full border border-[oklch(0.72_0.12_300/0.3)] bg-[oklch(0.72_0.12_300/0.1)] px-2 py-px text-micro font-medium text-[oklch(0.84_0.1_300)]", className)}>
      Coming soon
    </span>
  );
}

function Neighbour({ article, direction, onOpen }: { article: Article; direction: "prev" | "next"; onOpen: ArticleViewProps["onOpen"] }) {
  const prev = direction === "prev";
  return (
    <button
      type="button"
      onClick={() => onOpen(article.id)}
      className={cn("flex cursor-pointer flex-col gap-[3px] rounded-[10px] border border-s-card-line bg-transparent px-3.5 py-2.5 text-s-t1 hover:border-[#33333b]", prev ? "items-start" : "items-end")}
    >
      <span className="flex items-center gap-1 text-[11.5px] text-s-dim">
        {prev && <ArrowLeft className="h-3.5 w-3.5" />}
        {prev ? "Previous" : "Next"}
        {!prev && <ArrowRight className="h-3.5 w-3.5" />}
      </span>
      <span className="text-[13.5px] font-medium">{article.title}</span>
    </button>
  );
}

/** One article: breadcrumb, icon and title, lede, blocks, Related, Previous / Next, and the TOC rail. */
export function ArticleView({ article, content, showToc, active, onOpen, onHome, onToc }: ArticleViewProps) {
  const Icon = iconFor(article.icon);
  const i = content.order.indexOf(article.id);
  const prev = i > 0 ? content.articles[content.order[i - 1]] : undefined;
  const next = i >= 0 && i < content.order.length - 1 ? content.articles[content.order[i + 1]] : undefined;
  const related = article.related.flatMap((id) => (content.articles[id] ? [content.articles[id]] : []));
  const headings = article.blocks.flatMap((b) => (b.type === "h" ? [b] : []));
  return (
    <div className={cn("mx-auto box-border flex items-start gap-12 px-8 pb-20 pt-8", showToc ? "max-w-[1010px]" : "max-w-[784px]")}>
      <article className="flex min-w-0 max-w-[720px] flex-1 flex-col gap-4">
        <div className="flex items-center gap-1.5 text-xs text-s-dim">
          <button type="button" onClick={onHome} className="cursor-pointer border-0 bg-transparent p-0 text-xs text-s-muted hover:text-s-t1">
            Help
          </button>
          <ChevronRight className="h-3.5 w-3.5" />
          <span>{content.groupOf[article.id]}</span>
        </div>
        <div className="flex items-start gap-3.5">
          <div className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[11px] bg-s-accent/14 text-s-accent-text">
            <Icon className="h-[23px] w-[23px]" strokeWidth={1.75} />
          </div>
          <h1 className="m-0 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[26px] font-semibold leading-[1.2] tracking-[-0.02em]">
            {article.title}
            {article.status === "coming-soon" && <SoonChip />}
          </h1>
        </div>
        {article.lede && (
          <p className="m-0 mb-2 text-pretty text-[15.5px] leading-[1.6] text-[#b4b4bd]">
            <InlineText text={article.lede} onOpen={onOpen} />
          </p>
        )}

        {article.blocks.map((block, n) =>
          block.type === "h" ? (
            <h2 key={n} data-hid={block.id} className="m-0 mt-[18px] scroll-mt-5 text-lg font-semibold tracking-[-0.01em]">
              <InlineText text={block.text} onOpen={onOpen} />
            </h2>
          ) : (
            <BlockView key={n} block={block} onOpen={onOpen} />
          )
        )}

        {related.length > 0 && (
          <section className="mt-7 flex flex-col gap-2.5">
            <h2 className="m-0 text-xs font-medium text-s-muted">Related</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2">
              {related.map((r) => {
                const RelatedIcon = iconFor(r.icon);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onOpen(r.id)}
                    className="flex cursor-pointer items-center gap-2.5 whitespace-normal rounded-[10px] border border-s-card-line bg-s-card px-3.5 py-3 text-left text-[13px] font-medium text-s-t1 hover:border-[#33333b]"
                  >
                    <RelatedIcon className="h-[17px] w-[17px] shrink-0 text-s-dim" />
                    {r.title}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <div className="mt-4 flex flex-wrap justify-between gap-3 border-t border-s-divider pt-5">
          {prev && <Neighbour article={prev} direction="prev" onOpen={onOpen} />}
          <span className="flex-1" />
          {next && <Neighbour article={next} direction="next" onOpen={onOpen} />}
        </div>
      </article>

      {showToc && (
        <nav aria-label="On this page" className="sticky top-8 flex w-[190px] shrink-0 flex-col gap-0.5">
          <div className="pb-2 pl-3 text-[11px] font-medium uppercase tracking-[0.07em] text-s-dim">On this page</div>
          {headings.map((h) => {
            const on = h.id === active;
            return (
              <button
                key={h.id}
                type="button"
                aria-current={on ? "location" : undefined}
                onClick={() => onToc(h.id)}
                className={cn(
                  "cursor-pointer whitespace-normal border-0 border-l-2 bg-transparent px-3 py-[5px] text-left text-[12.5px] leading-[1.4]",
                  on ? "border-s-accent text-s-t1" : "border-s-track-line text-s-muted"
                )}
              >
                {stripInline(h.text)}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
