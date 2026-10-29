import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { updateText, type ConfigUpdate } from "@/lib/config-update-text";
import { isRemoteEditRefusal, isUnreachable, pushConfig } from "@/lib/dashboard-server";
import type { DashboardConfig } from "@/lib/layout";
import { logFrontend } from "@/lib/desktop";

const BUTTON = "h-8 rounded-[7px] border px-3.5 text-[12.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent disabled:opacity-60";
const PRIMARY = cn(BUTTON, "border-ui-accent bg-ui-accent font-semibold text-ui-inverse-fg hover:opacity-90");
const OUTLINE = cn(BUTTON, "border-ui-strong bg-ui-raised text-ui-1 hover:bg-ui-hover");

interface ConfigUpdateDialogProps {
  /** The version the saved config is updated from (`updateFrom`). */
  from: number;
  /** The config as loaded, migrated in memory: what Update now saves. */
  config: DashboardConfig;
  /** The server took it: the studio may push again. */
  onSaved: (config: DashboardConfig) => void;
  /** A save the server refused: a newer version saved the config meanwhile. */
  onFailed: (err: unknown) => void;
  onClose: () => void;
}

/**
 * The one-time "your screens need an update" message (`lib/config-update.ts`): Update now saves the migrated config, the
 * server keeping the old file first and naming it (`config.backup-before-v<N>.json`); the studio pushes nothing until then.
 */
export function ConfigUpdateDialog({ from, config, onSaved, onFailed, onClose }: ConfigUpdateDialogProps) {
  const [update, setUpdate] = useState<ConfigUpdate>({ state: "ask", from });
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), [update.state]);
  const { title, body } = updateText(update);
  const done = update.state === "done";

  const save = () => {
    setUpdate({ state: "saving", from });
    pushConfig(config)
      .then(({ backup }) => {
        onSaved(config);
        setUpdate({ state: "done", from, ...(backup ? { backup } : {}) });
        void logFrontend("warn", `Config updated from version ${from}${backup ? `; backup at ${backup}` : ""}`).catch(() => {});
      })
      .catch((err: unknown) => {
        onFailed(err);
        const error = isUnreachable(err)
          ? "The server couldn't be reached."
          : isRemoteEditRefusal(err)
            ? "Editing from other devices is off: update from the PC running InfoPanel Studio."
            : err instanceof Error
              ? err.message
              : String(err);
        setUpdate({ state: "failed", from, error });
      });
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="config-update-title"
        aria-describedby="config-update-body"
        className="flex w-[440px] max-w-full flex-col gap-3 rounded-[12px] border border-ui-strong bg-ui-panel p-5 shadow-ui-modal"
      >
        <h2 id="config-update-title" className="m-0 text-[14px] font-semibold text-ui-1">
          {title}
        </h2>
        <p id="config-update-body" className="m-0 break-words text-[12.5px] leading-[1.5] text-ui-2">
          {body}
        </p>
        <div className="flex justify-end gap-2">
          <button ref={button} type="button" disabled={update.state === "saving"} onClick={done ? onClose : save} className={done ? OUTLINE : PRIMARY}>
            {done ? "Continue" : update.state === "saving" ? "Updating…" : update.state === "failed" ? "Try again" : "Update now"}
          </button>
        </div>
      </div>
    </div>
  );
}
