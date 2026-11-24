import type { ReactNode } from "react";
import { ClaudeButton } from "../ClaudeButton";

/** An inspector action: the chrome's raised button (a link takes the same look). */
export const ACTION =
  "inline-flex h-7 items-center whitespace-nowrap rounded-ui-md border border-ui-strong bg-ui-raised px-2 text-caption text-ui-2 hover:border-ui-hover-edge hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";

/** A titled part of the inspector, with a count when it has one. Not a `<section>`: the page's widget sections are the only ones. */
export function Block({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <div role="group" aria-label={title} className="space-y-1.5 border-t border-ui-subtle pt-3">
      <h3 className="text-micro font-semibold uppercase tracking-wider text-ui-3">
        {title}
        {count !== undefined && <span className="ml-1.5 font-ui-mono font-normal">{count}</span>}
      </h3>
      {children}
    </div>
  );
}

/** A quiet line: what a part has when it has nothing, or why it was not read. */
export const Quiet = ({ children }: { children: ReactNode }) => <p className="text-caption text-ui-3">{children}</p>;

/** Facts as a two-column list: a term, then its value. */
export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-caption">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-ui-3">{term}</dt>
          <dd className="m-0 min-w-0 break-words text-ui-2">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A path or a value that copies itself when clicked, and reads "copied" for a moment. */
export function Copyable({ text, title }: { text: string; title?: string }) {
  return <ClaudeButton text={async () => text} title={title ?? `Copy ${text}`} label={text} className="max-w-full truncate rounded-ui-sm text-left font-ui-mono text-micro text-ui-2 hover:text-ui-1 hover:underline focus-visible:outline-2 focus-visible:outline-ui-accent" />;
}
