import { ArrowRight, BookOpen, Clock, Info, Lightbulb, Settings, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTION_NAMES } from "@/settings/model/search";
import { comboParts } from "../combo";
import { useEnv } from "../env";
import { generate } from "../generated";
import { parseOpenTarget } from "../routes";
import type { Block, CalloutKind } from "../types";
import { InlineText } from "./inline-text";

interface BlockProps {
  block: Block;
  onOpen: (article: string, heading?: string) => void;
}

interface CalloutStyle {
  icon: LucideIcon;
  label: string;
  fg: string;
  box: string;
}

const CALLOUTS: Record<CalloutKind, CalloutStyle> = {
  tip: { icon: Lightbulb, label: "Tip", fg: "text-[oklch(0.84_0.14_150)]", box: "border-[oklch(0.78_0.16_150/0.22)] bg-[oklch(0.78_0.16_150/0.07)]" },
  note: { icon: Info, label: "Note", fg: "text-[oklch(0.84_0.12_255)]", box: "border-[oklch(0.72_0.15_255/0.22)] bg-[oklch(0.72_0.15_255/0.07)]" },
  warn: { icon: TriangleAlert, label: "Heads up", fg: "text-[oklch(0.86_0.13_80)]", box: "border-[oklch(0.82_0.14_75/0.25)] bg-[oklch(0.82_0.14_75/0.07)]" },
  soon: { icon: Clock, label: "Coming soon", fg: "text-[oklch(0.84_0.1_300)]", box: "border-[oklch(0.72_0.12_300/0.25)] bg-[oklch(0.72_0.12_300/0.07)]" },
};

function Callout({ kind, text, onOpen }: { kind: CalloutKind; text: string; onOpen: BlockProps["onOpen"] }) {
  const { icon: Icon, label, fg, box } = CALLOUTS[kind];
  return (
    <div className={cn("flex gap-3 rounded-[11px] border px-4 py-[13px]", box)}>
      <Icon className={cn("mt-px h-[19px] w-[19px] shrink-0", fg)} />
      <div className="flex flex-1 flex-col gap-[3px]">
        <span className={cn("text-xs font-semibold", fg)}>{label}</span>
        <span className="text-pretty text-[13.5px] leading-[1.6] text-[#d6d6db]">
          <InlineText text={text} onOpen={onOpen} />
        </span>
      </div>
    </div>
  );
}

function List({ items, ordered, onOpen }: { items: string[]; ordered: boolean; onOpen: BlockProps["onOpen"] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          {ordered ? (
            <span className="mt-px grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border border-s-input-line bg-s-nav-on text-[11.5px] font-semibold text-s-t2">{i + 1}</span>
          ) : (
            <span className="ml-1 mr-1.5 mt-2.5 h-[5px] w-[5px] shrink-0 rounded-full bg-s-faint" />
          )}
          <span className="flex-1 text-pretty text-sm leading-[1.65] text-[#d0d0d6]">
            <InlineText text={item} onOpen={onOpen} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Column widths by count, as the design sets them. */
function columns(n: number): string {
  if (n === 2) return "minmax(140px,0.9fr) minmax(0,2fr)";
  if (n === 3) return "minmax(120px,0.8fr) minmax(0,1.3fr) minmax(0,1.3fr)";
  return `minmax(140px,1.4fr) repeat(${n - 1},minmax(0,1fr))`;
}

function Table({ head, rows, onOpen }: { head: string[]; rows: string[][]; onOpen: BlockProps["onOpen"] }) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroller must take focus so the keyboard can scroll it.
    <div role="region" aria-label={head.join(", ")} tabIndex={0} className="overflow-auto rounded-[11px] border border-s-card-line bg-s-card">
      <div role="table" className="grid" style={{ gridTemplateColumns: columns(head.length), minWidth: head.length > 2 ? 520 : 0 }}>
        <div role="row" className="contents">
        {head.map((cell, i) => (
          <div key={i} role="columnheader" className="border-b border-s-card-line bg-s-side px-3.5 py-[9px] text-[11.5px] font-medium text-s-dim">
            {cell}
          </div>
        ))}
        </div>
        {rows.map((row, r) => (
          <div key={r} role="row" className="contents">
            {row.map((cell, c) => (
            <div key={c} role={c === 0 ? "rowheader" : "cell"} className={cn("px-3.5 py-2.5 text-[13px] leading-[1.55]", c === 0 ? "text-s-t1" : "text-[#c2c2ca]", r > 0 && "border-t border-s-divider")}>
              <InlineText text={cell} onOpen={onOpen} small />
            </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Cap({ children }: { children: string }) {
  return (
    <kbd className="min-w-3 whitespace-nowrap rounded-[5px] border border-b-2 border-s-input-line bg-[#1a1a1f] px-[7px] py-0.5 text-center font-mono text-[11.5px] text-s-t1">{children}</kbd>
  );
}

function Keys({ rows }: { rows: [string, string][] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] rounded-[11px] border border-s-card-line bg-s-card">
      {rows.map(([combo, label], i) => (
        <div key={i} className="flex items-center gap-3 border-b border-s-side-line px-3.5 py-2.5">
          <span className="flex-1 text-[13px] text-[#d0d0d6]">{label}</span>
          <span className="flex flex-wrap items-center justify-end gap-1">
            {comboParts(combo).map((alt, a) => (
              <span key={a} className="flex items-center gap-1">
                {a > 0 && <span className="text-[11px] text-s-dim">/</span>}
                {alt.map((key, k) => (
                  <Cap key={k}>{key}</Cap>
                ))}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function Flow({ steps }: { steps: [string, string][] }) {
  return (
    <div className="flex flex-wrap items-stretch gap-1.5">
      {steps.map(([title, description], i) => (
        <div key={i} className="flex flex-[1_1_140px] items-center gap-1.5">
          <div className="flex flex-1 flex-col gap-1 self-stretch rounded-[10px] border border-s-card-line bg-s-card px-3.5 py-3">
            <span className="font-mono text-[11px] text-s-dim">{String(i + 1).padStart(2, "0")}</span>
            <span className="text-[13.5px] font-semibold">{title}</span>
            <span className="text-xs leading-[1.45] text-s-muted">{description}</span>
          </div>
          {i < steps.length - 1 && <ArrowRight className="h-4 w-4 shrink-0 text-[#44444c]" />}
        </div>
      ))}
    </div>
  );
}

/** The deep-link button of `:::open`: Settings sections need the desktop app, Help routes work anywhere. */
function OpenButton({ target, label, onOpen }: { target: string; label: string; onOpen: BlockProps["onOpen"] }) {
  const env = useEnv();
  const route = parseOpenTarget(target);
  if (!route || (route.kind === "settings" && !env.desktop)) return null;
  const Icon = route.kind === "settings" ? Settings : BookOpen;
  const go = () => (route.kind === "settings" ? env.openSettings(route.section) : onOpen(route.article, route.heading));
  return (
    <button
      type="button"
      title={route.kind === "settings" ? `Settings › ${SECTION_NAMES[route.section]}` : undefined}
      onClick={go}
      className="flex h-[34px] cursor-pointer items-center gap-2 self-start rounded-lg border border-s-input-line bg-s-input px-3 text-[12.5px] text-s-t1 hover:border-[#3a3a44]"
    >
      <Icon className="h-4 w-4 text-s-accent-text" />
      Open {label}
    </button>
  );
}

/** One block of an article, drawn as elements. A `h` block is the article view's (it needs the scroll anchor). */
export function BlockView({ block, onOpen }: BlockProps) {
  switch (block.type) {
    case "h":
      return null;
    case "p":
      return (
        <p className="m-0 text-pretty text-sm leading-[1.7] text-[#d0d0d6]">
          <InlineText text={block.text} onOpen={onOpen} />
        </p>
      );
    case "ul":
    case "ol":
      return <List items={block.items} ordered={block.type === "ol"} onOpen={onOpen} />;
    case "table":
      return <Table head={block.head} rows={block.rows} onOpen={onOpen} />;
    case "callout":
      return <Callout kind={block.kind} text={block.text} onOpen={onOpen} />;
    case "keys":
      return <Keys rows={block.rows} />;
    case "flow":
      return <Flow steps={block.steps} />;
    case "open":
      return <OpenButton target={block.target} label={block.label} onOpen={onOpen} />;
    case "generated":
      return (
        <>
          {generate(block.key).map((b, i) => (
            <BlockView key={i} block={b} onOpen={onOpen} />
          ))}
        </>
      );
  }
}
