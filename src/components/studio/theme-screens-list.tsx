import { useState } from "react";

/** Apply to other screens…: a checkbox per screen (name and size), Select all, and Apply. */
export default function ScreensList({ screens, onApply }: { screens: readonly { id: string; name: string; size: string }[]; onApply: (ids: string[]) => void }) {
  const [ticked, setTicked] = useState<readonly string[]>([]);
  const all = ticked.length === screens.length;
  const toggle = (id: string) => setTicked((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  return (
    <div role="group" aria-label="Other screens" className="flex flex-col gap-1.5 rounded-lg border border-ui-strong bg-[#131316] px-3 py-2">
      <label className="flex items-center gap-2 text-[12px] text-[#a1a1aa]">
        <input type="checkbox" checked={all} onChange={() => setTicked(all ? [] : screens.map((s) => s.id))} />
        Select all
      </label>
      {screens.map((s) => (
        <label key={s.id} className="flex items-center gap-2 text-[13px] text-ui-1">
          <input type="checkbox" checked={ticked.includes(s.id)} onChange={() => toggle(s.id)} />
          <span className="min-w-0 flex-1 truncate">{s.name}</span>
          <span className="shrink-0 text-[11px] text-[#71717a]">{s.size}</span>
        </label>
      ))}
      <button
        type="button"
        disabled={ticked.length === 0}
        onClick={() => onApply([...ticked])}
        className="h-7 self-start rounded-md bg-[#3b82f6] px-3 text-[12px] font-medium text-white disabled:opacity-50"
      >
        Apply
      </button>
    </div>
  );
}
