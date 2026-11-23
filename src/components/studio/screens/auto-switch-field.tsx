import { useEffect, useRef, useState } from "react";
import type { AutoSwitch } from "@/lib/pinned";
import { parseExeList } from "@/lib/profile-switch";
import { cn } from "@/lib/utils";
import { FIELD, StackRow } from "../setting-rows";

const HINT =
  "While one of these programs is in front on this PC, its panel switches to this screen, chosen among the screens of the same size. Empty: off. Hold the profile chip on the panel to lock a screen or pause switching.";

/**
 * A screen's auto-switch rules (P4, decision 7): the program names, comma separated. A draft that commits on Enter or
 * blur (and when the drawer closes mid-typing), so a half-typed name never reaches the config or the undo history.
 */
export function AutoSwitchField({ value, onCommit }: { value: AutoSwitch | undefined; onCommit: (next: AutoSwitch | undefined) => void }) {
  const text = value?.exe.join(", ") ?? "";
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  const commit = () => {
    const exe = parseExeList(draft);
    setDraft(exe.join(", "));
    if (exe.join("\n") !== (value?.exe ?? []).join("\n")) onCommit(exe.length ? { exe } : undefined);
  };
  const closing = useRef(commit);
  closing.current = commit;
  useEffect(() => () => closing.current(), []);
  return (
    <StackRow label="Programs" hint={HINT}>
      <input
        type="text"
        value={draft}
        aria-label="Programs"
        placeholder="Code.exe, obs64.exe"
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={cn(FIELD, "h-7.5 w-full font-ui-mono text-micro")}
      />
    </StackRow>
  );
}
