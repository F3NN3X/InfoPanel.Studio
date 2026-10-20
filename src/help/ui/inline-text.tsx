import { Fragment } from "react";
import { helpPageUrl } from "../links";
import { parseInline } from "../inline";
import { useEnv } from "../env";

interface InlineTextProps {
  text: string;
  /** Called for an article link; the link also carries a real address for a new tab. */
  onOpen: (article: string, heading?: string) => void;
  /** `code` pills one size down in table cells. */
  small?: boolean;
}

const LINK = "border-b border-s-accent/40 text-s-accent-text no-underline hover:text-s-t1";

/** `code`, **bold** and links inside a block's text. Rendered as elements, never as HTML. */
export function InlineText({ text, onOpen, small }: InlineTextProps) {
  const env = useEnv();
  return (
    <>
      {parseInline(text).map((run, i) => (
        <Fragment key={i}>
          {run.kind === "text" && run.text}
          {run.kind === "code" && (
            <code className={`rounded border border-[#26262c] bg-[#1a1a1f] font-mono text-s-t1 ${small ? "px-1 text-xs" : "px-[5px] text-[12.5px]"}`}>{run.text}</code>
          )}
          {run.kind === "bold" && <strong className="font-semibold text-s-t1">{run.text}</strong>}
          {run.kind === "article" && (
            <a
              href={helpPageUrl({ article: run.article, heading: run.heading })}
              className={LINK}
              onClick={(e) => {
                e.preventDefault();
                onOpen(run.article, run.heading);
              }}
            >
              {run.label}
            </a>
          )}
          {run.kind === "external" && (
            <a
              href={run.url}
              target="_blank"
              rel="noreferrer noopener"
              className={LINK}
              onClick={(e) => {
                if (!env.desktop) return;
                e.preventDefault();
                env.openExternal(run.url);
              }}
            >
              {run.label}
            </a>
          )}
        </Fragment>
      ))}
    </>
  );
}
