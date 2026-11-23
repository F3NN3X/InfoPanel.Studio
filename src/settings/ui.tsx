import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useFound } from "./found";
import { useStore } from "./store";

/** Briefly true after `flash()`: the "Copied" label, also said through the toast's status region. */
export function useFlag(ms = 1500): [boolean, () => void] {
  const { toast } = useStore();
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = useCallback(() => {
    clearTimeout(timer.current);
    setOn(true);
    toast("Copied");
    timer.current = setTimeout(() => setOn(false), ms);
  }, [ms, toast]);
  return [on, flash];
}

export * from "./kit";

const TONES = {
  green: { text: "text-s-green", tint: "bg-s-green/14", dot: "bg-s-green", halo: "shadow-[0_0_0_3px_oklch(0.78_0.16_150/0.18)]" },
  grey: { text: "text-s-dim", tint: "bg-s-grey/18", dot: "bg-s-dim", halo: "shadow-[0_0_0_3px_rgb(111_111_121/0.18)]" },
  red: { text: "text-s-red", tint: "bg-s-red/14", dot: "bg-s-red", halo: "shadow-[0_0_0_3px_oklch(0.7_0.18_25/0.18)]" },
  amber: { text: "text-s-amber", tint: "bg-s-amber/14", dot: "bg-s-amber", halo: "shadow-[0_0_0_3px_oklch(0.82_0.14_75/0.18)]" },
  blue: { text: "text-s-accent", tint: "bg-s-accent/14", dot: "bg-s-accent", halo: "shadow-[0_0_0_3px_oklch(0.72_0.15_255/0.18)]" },
} as const;

export type ToneName = keyof typeof TONES;

export const tone = (name: ToneName) => TONES[name];

/** The 44px state icon tile of the server and update cards. */
export function StateTile({ tone: name, children }: { tone: ToneName; children: ReactNode }) {
  return <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", TONES[name].tint, TONES[name].text)}>{children}</div>;
}

/** A page's card of the status kind (server, updates, hero). */
export function HeroCard({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  const found = useFound(id);
  return (
    <div ref={found.ref} className={cn("rounded-14 border border-s-card-line bg-s-card", found.className, className)}>
      {children}
    </div>
  );
}

export { Kbd } from "@/app-window/kbd";
