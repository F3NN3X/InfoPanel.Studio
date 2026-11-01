import { TitleBar } from "@/app-window/title-bar";
import { Button } from "./ui";

interface LoadStateProps {
  /** Why the first load failed; null while it is still running. */
  error: string | null;
  onRetry: () => void;
}

/** What the Settings window shows before its store has loaded: the caption buttons stay, so a failed load can still be closed. */
export function LoadState({ error, onRetry }: LoadStateProps) {
  return (
    <div className="s-scope flex h-screen flex-col overflow-hidden bg-s-win text-s-t1">
      <TitleBar title="InfoPanel Studio — Settings" />
      <div className="grid flex-1 place-items-center px-8">
        {error !== null && (
          <div role="alert" className="flex max-w-[420px] flex-col items-start gap-3">
            <h1 className="m-0 text-lg font-semibold">Couldn't load settings</h1>
            <p className="m-0 text-pretty text-[13.5px] leading-normal text-s-muted">{error}</p>
            <p className="m-0 text-pretty text-[13.5px] leading-normal text-s-muted">If Retry keeps failing, restart InfoPanel Studio.</p>
            <Button kind="accent" size="md" onClick={onRetry}>
              Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
