import { useEffect, useState } from "react";
import { DialogParts } from "@/components/ui/dialog";
import { distinctCommands, type CommandUse } from "@/lib/action-commands";
import { actionsState, changeActions, type ActionsState } from "@/lib/action-runner";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";

interface CommandReviewDialogProps {
  /** The commands the imported screens name, with where. */
  uses: readonly CommandUse[];
  onClose: () => void;
}

/**
 * The commands an import brought in, for review (pinned layer P7, decision 4): every one is listed, in full, with where it
 * is used, and stays off until it is approved here. Nothing is approved unless switched on; Keep them off closes. Approving
 * works on the PC running InfoPanel Studio only (the server refuses it from another device), and the runner itself is
 * Settings › Actions' switch.
 */
export function CommandReviewDialog({ uses, onClose }: CommandReviewDialogProps) {
  const commands = distinctCommands(uses);
  const [state, setState] = useState<ActionsState | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string>();
  useEffect(() => {
    let alive = true;
    void actionsState().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);
  const approved = (c: string) => state?.approved.includes(c) === true;
  const fresh = commands.filter((c) => !approved(c));
  const approve = async () => {
    if (picked.size === 0) return onClose();
    const r = await changeActions({ approve: [...picked] });
    if ("error" in r) setError(r.error);
    else onClose();
  };
  return (
    <DialogParts.Root open onOpenChange={(next) => !next && onClose()}>
      <DialogParts.Content data-command-review="" className="w-[min(36rem,calc(100vw-2rem))]">
        <DialogParts.Title>Review the commands you imported</DialogParts.Title>
        <DialogParts.Description>
          {commands.length === 1 ? "The imported screen runs a command" : `The imported screens run ${commands.length} commands`} from a key or a touch. A command
          runs a program on this PC, so each stays off until you approve it. Approve only what you read and trust.
          {state && !state.runner && " Running commands is also off in Settings › Actions."}
        </DialogParts.Description>
        <ul className="space-y-2" aria-label="Commands">
          {commands.map((c) => {
            const where = uses.filter((u) => u.command === c).map((u) => `${u.profile} › ${u.where}`);
            return (
              <li key={c} className="rounded-md border border-ui-subtle p-2">
                <div className="flex items-start gap-3">
                  {/* the whole command, never cut: it wraps */}
                  <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-ui-mono text-micro text-ui-1">{c}</code>
                  {approved(c) ? (
                    <span className="shrink-0 text-caption text-ui-3">Already approved</span>
                  ) : (
                    <Toggle
                      checked={picked.has(c)}
                      label={`Approve ${c}`}
                      onChange={(on) => setPicked((s) => (on ? new Set([...s, c]) : new Set([...s].filter((x) => x !== c))))}
                    />
                  )}
                </div>
                <p className="mt-1 text-micro text-ui-3">{where.join(" · ")}</p>
              </li>
            );
          })}
        </ul>
        {state === null && <p className="text-caption text-ui-warn">The approvals can't be read here. Approve commands in Settings › Actions on the PC running InfoPanel Studio.</p>}
        {error && (
          <p role="alert" className="text-caption text-ui-danger">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2 pt-1">
          <Button className="ml-auto" onClick={onClose}>
            {fresh.length ? "Keep them off" : "Close"}
          </Button>
          {fresh.length > 0 && state && (
            <Button variant="primary" disabled={picked.size === 0} onClick={() => void approve()}>
              {picked.size > 1 ? `Approve ${picked.size}` : "Approve"}
            </Button>
          )}
        </div>
      </DialogParts.Content>
    </DialogParts.Root>
  );
}
