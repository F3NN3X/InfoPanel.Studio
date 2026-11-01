import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { Check, Copy, FolderOpen, ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorText, ipc } from "../ipc";
import { countLevels, filterLines, lineText, pushLines, type LevelFilter, type LogLevel, type LogLine } from "../model/logs";
import { useFound, useStore } from "../store";
import type { LogSource } from "../types";
import { Button, radioProps, Segmented, useFlag } from "../ui";

/** How often the open page asks for new lines. */
const POLL_MS = 1000;

const SOURCES: { value: LogSource; label: string }[] = [
  { value: "server", label: "Server" },
  { value: "app", label: "App" },
  { value: "studio", label: "Studio" },
];

const LEVEL_CHIPS: { value: LevelFilter; label: string; dot: string }[] = [
  { value: "all", label: "All", dot: "bg-s-muted" },
  { value: "error", label: "Errors", dot: "bg-s-red" },
  { value: "warn", label: "Warnings", dot: "bg-s-amber" },
  { value: "info", label: "Info", dot: "bg-[#7fa7ff]" },
  { value: "debug", label: "Debug", dot: "bg-s-dim" },
];

const LEVEL_TEXT: Record<LogLevel, string> = { error: "text-s-red", warn: "text-s-amber", info: "text-[#7fa7ff]", debug: "text-s-dim" };
const MESSAGE_TEXT: Record<LogLevel, string> = { error: "text-[oklch(0.85_0.08_25)]", warn: "text-[#d6d6db]", info: "text-[#d6d6db]", debug: "text-s-dim" };

/** What the page remembers of one log between polls. */
interface Buffer {
  cursor?: string;
  file?: string;
  nextId: number;
  lines: LogLine[];
}

export function LogsSection() {
  const { settings, toast } = useStore();
  const [source, setSource] = useState<LogSource>("server");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [query, setQuery] = useState("");
  const [follow, setFollow] = useState(true);
  const [copied, flash] = useFlag();
  const buffers = useRef(new Map<LogSource, Buffer>());
  const viewer = useRef<HTMLDivElement>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const found = useFound("logs");

  const buffer = buffers.current.get(source) ?? { nextId: 0, lines: [] };

  useEffect(() => {
    let alive = true;
    let reading = false;
    const poll = async () => {
      if (reading || document.visibilityState !== "visible") return;
      reading = true;
      try {
        const buf = buffers.current.get(source) ?? { nextId: 0, lines: [] };
        const chunk = await ipc.readLog(source, buf.cursor);
        if (!alive) return;
        // A rotated file starts over: the lines of the old one are gone.
        const kept = chunk.reset ? [] : buf.lines;
        buffers.current.set(source, {
          cursor: chunk.cursor,
          file: chunk.file,
          nextId: buf.nextId + chunk.lines.length,
          lines: pushLines(kept, chunk.lines, buf.nextId),
        });
        redraw();
        setUnreadable(false);
      } catch {
        // The next poll tries again.
        if (alive) setUnreadable(true);
      } finally {
        reading = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [source]);

  const counts = useMemo(() => countLevels(buffer.lines), [buffer.lines]);
  const visible = useMemo(() => filterLines(buffer.lines, level, query), [buffer.lines, level, query]);

  useLayoutEffect(() => {
    const el = viewer.current;
    if (follow && el) el.scrollTop = el.scrollHeight;
  }, [visible, follow]);

  // Scrolling up leaves follow mode; coming back to the bottom rejoins it.
  const onScroll = () => {
    const el = viewer.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
    if (atBottom !== follow) setFollow(atBottom);
  };

  const copy = () =>
    navigator.clipboard.writeText(visible.map(lineText).join("\n")).then(flash, () => toast("Could not copy.", true));

  return (
    <div ref={found.ref} className={cn("flex flex-col gap-2.5", found.className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Log source" options={SOURCES} value={source} onChange={setSource} />
        <div className="flex gap-1" role="radiogroup" aria-label="Level">
          {LEVEL_CHIPS.map((c) => {
            const on = level === c.value;
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setLevel(c.value)}
                {...radioProps(LEVEL_CHIPS.map((x) => x.value), level, c.value, setLevel)}
                className={cn(
                  "flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs",
                  on ? "border-s-accent/50 bg-s-accent/12 text-s-t1" : "border-s-track-line bg-transparent text-s-muted hover:text-s-t1"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
                {c.label}
                <span className="font-mono text-[11px] text-s-dim">{counts[c.value]}</span>
              </button>
            );
          })}
        </div>
        <div className="flex h-8 min-w-40 flex-1 items-center gap-1.5 rounded-lg border border-s-track-line bg-[#141418] px-2.5">
          <ListFilter className="h-4 w-4 shrink-0 text-s-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter lines"
            aria-label="Filter lines"
            className="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-s-t1 outline-none placeholder:text-s-dim"
          />
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-s-card-line bg-s-well">
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scroller must take focus so the keyboard can scroll it. */}
        <div ref={viewer} onScroll={onScroll} role="region" aria-label="Log lines" tabIndex={0} className="h-[420px] overflow-auto py-2.5 font-mono text-xs leading-[1.7]" data-testid="log-viewer">
          <div className="w-max min-w-full">
            {visible.map((l) => (
              <div key={l.id} className="flex gap-3 whitespace-pre px-3.5 hover:bg-[#121215]">
                <span className="w-[12ch] shrink-0 text-s-dim">{l.ts}</span>
                <span className={cn("w-10 shrink-0", LEVEL_TEXT[l.level])}>{l.level.toUpperCase()}</span>
                <span className={MESSAGE_TEXT[l.level]}>{l.msg}</span>
              </div>
            ))}
            {visible.length === 0 && <div className="px-3.5 py-6 text-s-dim">No lines match.</div>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-s-side-line bg-s-side px-2.5 py-2">
          <button
            type="button"
            role="switch"
            aria-checked={follow}
            onClick={() => setFollow(!follow)}
            className="flex h-7 cursor-pointer items-center gap-2 rounded-[7px] border-0 bg-transparent px-2.5 text-xs text-s-t2"
          >
            <span className={cn("relative h-4 w-7 rounded-lg", follow ? "bg-s-accent" : "bg-[#2e2e35]")}>
              <span className={cn("absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-transform", follow && "translate-x-3")} />
            </span>
            Follow new lines
          </button>
          <span className="min-w-0 flex-1 text-[11.5px] text-s-dim">
            {unreadable ? "Can't read the log. It will keep trying." : `${visible.length} of ${buffer.lines.length} lines${settings.debug ? "" : " · debug lines hidden (debug mode off)"}`}
          </span>
          <Button className="h-7 text-xs" onClick={() => void copy()}>
            {copied ? <Check className="h-[15px] w-[15px]" /> : <Copy className="h-[15px] w-[15px]" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button className="h-7 text-xs" disabled={!buffer.file} onClick={() => void ipc.revealPath(buffer.file as string).catch((e) => toast(errorText(e), true))}>
            <FolderOpen className="h-[15px] w-[15px]" />
            Open file
          </Button>
        </div>
      </div>
    </div>
  );
}
