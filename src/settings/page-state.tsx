import { Button } from "./ui";

interface PageStateProps {
  /** What the page shows, for the failure line: "the changelog". */
  what: string;
  /** Null while loading; the reason once it failed. */
  error: string | null;
  onRetry: () => void;
  /** A place to read it elsewhere (the releases link). */
  fallback?: { label: string; href: string };
}

/** A Settings page before its data is here: placeholder lines while loading, then what failed and how to try again. */
export function PageState({ what, error, onRetry, fallback }: PageStateProps) {
  if (error === null) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading {what}…</span>
        <div aria-hidden className="h-24 rounded-xl bg-s-card motion-safe:animate-pulse" />
        <div aria-hidden className="h-24 rounded-xl bg-s-card motion-safe:animate-pulse" />
      </div>
    );
  }
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-s-card-line bg-s-card p-[18px]">
      <p className="m-0 text-body text-s-t2">
        Couldn’t load {what}. {error}
      </p>
      <div className="flex items-center gap-3">
        <Button onClick={onRetry}>Try again</Button>
        {fallback && (
          <a href={fallback.href} data-external rel="noopener noreferrer" className="text-[12.5px] text-s-accent-text hover:text-s-t1">
            {fallback.label}
          </a>
        )}
      </div>
    </div>
  );
}
