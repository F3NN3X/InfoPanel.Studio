import { useEffect, useState } from "react";
import { KeyRound, Plus, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorText, ipc } from "../ipc";
import { useFound, useStore } from "../store";
import type { WidgetKey } from "../types";
import { Button, Card, Group } from "../ui";

/** What each state says beside a key. */
const STATES: Record<WidgetKey["state"], { label: string; className: string }> = {
  trusted: { label: "Trusted", className: "bg-s-green/14 text-s-ok-text" },
  "not-set-up": { label: "Not set up", className: "bg-s-card-line text-s-muted" },
  "not-available": { label: "Not available yet", className: "bg-s-card-line text-s-muted" },
  removed: { label: "Removed", className: "bg-s-amber/14 text-s-amber" },
  revoked: { label: "Revoked", className: "bg-s-red/14 text-s-red" },
};

const KINDS: Record<WidgetKey["kind"], string> = {
  owner: "Built in · signs InfoPanel Studio's own code widgets",
  themely: "Built in · for widgets from Themely, once Themely signs them",
  user: "Added by you · not reviewed",
};

const FIELD = "h-(--ui-h-field) w-full rounded-lg border border-s-input-line bg-s-input px-2.5 text-body text-s-t1 outline-none focus:border-s-accent";

function KeyRow({ item, busy, onRemove, onRestore }: { item: WidgetKey; busy: boolean; onRemove: () => void; onRestore: () => void }) {
  const state = STATES[item.state];
  return (
    <div className="flex flex-wrap items-center gap-3 px-4.5 py-3.5" data-key={item.id}>
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-ui-menu bg-s-hover text-s-t2">
        <KeyRound className="h-4.5 w-4.5" />
      </div>
      <div className="flex min-w-48 flex-1 flex-col gap-0.75">
        <span className="text-body font-medium">{item.name}</span>
        <span className="text-caption text-s-muted">{KINDS[item.kind]}</span>
        <span className="font-mono text-caption text-s-t3">{item.fingerprint ? `Key ID ${item.fingerprint}` : "No key"}</span>
        {item.publishers.length > 0 && <span className="text-caption text-s-t3">Signs for: {item.publishers.join(", ")}</span>}
      </div>
      <span className={cn("rounded-ui-lg px-2 py-0.5 text-caption", state.className)}>{state.label}</span>
      {item.state === "trusted" && (
        <Button kind="danger" disabled={busy} onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
          Remove key
        </Button>
      )}
      {item.state === "removed" && (
        <Button disabled={busy} onClick={onRestore}>
          <RotateCcw className="h-4 w-4" />
          Trust again
        </Button>
      )}
    </div>
  );
}

/** The publisher names a field holds: split on commas and spaces. */
const publisherNames = (text: string): string[] => text.split(/[\s,]+/).filter(Boolean);

/**
 * Settings › Widget publishers (Phase 6a): the keys a code widget may be signed with. The owner's and Themely's are built in;
 * a user key is added here and nowhere else (never from an import or an install prompt), named, with the publisher names it may
 * sign for, and removed with "Remove key". The app's own commands keep them in the server's data folder.
 */
export function PublishersSection() {
  const { toast } = useStore();
  const [keys, setKeys] = useState<WidgetKey[] | null>(null);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [publishers, setPublishers] = useState("");
  const [busy, setBusy] = useState(false);
  const found = useFound("add-publisher-key");

  useEffect(() => {
    let alive = true;
    void ipc
      .widgetKeys()
      .then((k) => alive && setKeys(k))
      .catch((e) => toast(errorText(e), true));
    return () => {
      alive = false;
    };
  }, [toast]);

  const run = async (action: () => Promise<WidgetKey[]>, done: string) => {
    setBusy(true);
    try {
      setKeys(await action());
      toast(done);
      return true;
    } catch (e) {
      toast(errorText(e), true);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (await run(() => ipc.trustWidgetKey(name, key, publisherNames(publishers)), "Key added")) {
      setName("");
      setKey("");
      setPublishers("");
    }
  };

  const builtIn = keys?.filter((k) => k.kind !== "user") ?? [];
  const yours = keys?.filter((k) => k.kind === "user") ?? [];
  const row = (k: WidgetKey) => (
    <KeyRow key={k.id} item={k} busy={busy} onRemove={() => void run(() => ipc.removeWidgetKey(k.id), "Key removed")} onRestore={() => void run(() => ipc.restoreWidgetKey(k.id), "Key trusted again")} />
  );

  return (
    <>
      <p className="m-0 text-pretty text-caption leading-normal text-s-muted">
        A code widget runs only when a key listed here signed it. A key signs only for its publisher names: the <span className="font-mono">acme</span> in{" "}
        <span className="font-mono">ext:acme.clock</span>. Widgets signed by a key you add are not reviewed by InfoPanel Studio.
      </p>
      <Group title="Built in">
        <Card>{builtIn.map(row)}</Card>
      </Group>
      <Group title="Keys you trust">
        <Card>
          {yours.length ? yours.map(row) : <p className="m-0 px-4.5 py-3.5 text-caption text-s-muted">None yet.</p>}
        </Card>
      </Group>
      <Group title="Add a key">
        <div ref={found.ref} className={cn("flex flex-col gap-3 rounded-xl border border-s-card-line bg-s-card px-4.5 py-4", found.className)}>
          <label className="flex flex-col gap-1.5 text-caption text-s-t2">
            Name
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Who the key belongs to" className={FIELD} />
          </label>
          <label className="flex flex-col gap-1.5 text-caption text-s-t2">
            Publisher names
            <input value={publishers} onChange={(e) => setPublishers(e.target.value)} placeholder="acme" spellCheck={false} className={cn(FIELD, "font-mono")} />
            <span className="text-s-muted">
              The publisher part of the widgets' ids this key may sign (<span className="font-mono">ext:&lt;publisher&gt;.&lt;id&gt;</span>), separated by commas. A name
              another key holds, or a built-in one (<span className="font-mono">infopanel</span>, <span className="font-mono">themely</span>), is refused.
            </span>
          </label>
          <label className="flex flex-col gap-1.5 text-caption text-s-t2">
            minisign public key
            <textarea
              value={key}
              onChange={(e) => setKey(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder={"untrusted comment: minisign public key …\nRWQ…"}
              className="w-full resize-none rounded-lg border border-s-input-line bg-s-input px-2.5 py-2 font-mono text-caption text-s-t1 outline-none focus:border-s-accent"
            />
          </label>
          <div className="flex">
            <Button kind="accent" disabled={busy || !name.trim() || !key.trim() || !publisherNames(publishers).length} onClick={() => void add()}>
              <Plus className="h-4 w-4" />
              Add key
            </Button>
          </div>
        </div>
      </Group>
    </>
  );
}
