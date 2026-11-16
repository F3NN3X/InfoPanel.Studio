import { Check, Lock } from "lucide-react";
import { series } from "./rail";

/*
 * The profile picker (design only; P4 builds it, decision 7): the profile chip's tap opens it beside the rail. Each profile
 * of this panel's size with its rule (the apps in front that switch to it), the current one and the one whose rule matches
 * now; "Switch with the app in front" turns auto-switch on, and the lock keeps this profile whatever is in front (the lock
 * is the control channel's override with auto-switch paused, and it wins). Rows are 64 px, the switch and the lock 56 px.
 */

export interface PickerProfile {
  id: string;
  name: string;
  series: number;
  /** "Default · 3 pages", or the rule: "Auto: Code.exe, WindowsTerminal.exe". */
  detail: string;
}

export interface PickerSpec {
  profiles: PickerProfile[];
  current: string;
  /** The profile whose rule matches the app in front, when it is not the current one. */
  matches?: string;
  front: string;
  auto: boolean;
}

export function ProfilePicker({ spec, left, top, width, maxHeight }: { spec: PickerSpec; left: number; top: number; width: number; maxHeight: number }) {
  const current = spec.profiles.find((p) => p.id === spec.current);
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="picker-title"
      className="absolute z-20 flex flex-col p-4"
      style={{ borderRadius: 20, left, top, width, maxHeight, background: "var(--w-card)", color: "var(--w-fg)", boxShadow: "inset 0 0 0 1px var(--w-edge), 0 18px 48px -12px color-mix(in oklab, var(--w-page) 85%, transparent)" }}
    >
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="picker-title" className="text-[18px] font-semibold">
          Profiles
        </h2>
        <span className="text-[13px]" style={{ color: "var(--w-muted)" }}>
          In front: {spec.front}
        </span>
      </header>
      <ul aria-label="Profiles" className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
        {spec.profiles.map((p) => {
          const on = p.id === spec.current;
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-current={on ? "true" : undefined}
                className="flex min-h-16 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left"
                style={{ background: on ? "color-mix(in oklab, var(--w-accent) 10%, transparent)" : "color-mix(in oklab, var(--w-fg) 4%, transparent)", boxShadow: on ? "inset 0 0 0 2px var(--w-accent)" : "inset 0 0 0 1px var(--w-edge)" }}
              >
                <span aria-hidden className="h-9 w-9 shrink-0 rounded-[10px]" style={{ background: series(p.series) }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-tight">{p.name}</span>
                  <span className="block truncate text-[13px] leading-tight" style={{ color: "var(--w-muted)" }}>
                    {p.detail}
                  </span>
                </span>
                {on && (
                  <span className="text-[13px] font-semibold" style={{ color: "var(--w-accent)" }}>
                    Current
                  </span>
                )}
                {p.id === spec.matches && (
                  <span className="text-[13px] font-semibold" style={{ color: "var(--w-warn)" }}>
                    Matches now
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <footer className="mt-3 grid gap-3" style={{ gridTemplateColumns: "1.3fr 1fr" }}>
        <button
          type="button"
          role="switch"
          aria-checked={spec.auto}
          className="flex h-14 items-center justify-between gap-2 rounded-2xl px-4 text-[14px]"
          style={{ boxShadow: "inset 0 0 0 1px var(--w-edge)" }}
        >
          Switch with the app in front
          <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-md" style={spec.auto ? { background: "var(--w-accent)", color: "var(--w-accent-on)" } : { boxShadow: "inset 0 0 0 1.5px var(--w-muted)" }}>
            {spec.auto && <Check size={16} strokeWidth={3} />}
          </span>
        </button>
        <button
          type="button"
          className="flex h-14 items-center justify-center gap-2 rounded-2xl text-[14px] font-semibold"
          style={{ background: "var(--w-fg)", color: "var(--w-card)" }}
        >
          <Lock aria-hidden size={16} /> Lock to {current?.name}
        </button>
      </footer>
    </section>
  );
}
