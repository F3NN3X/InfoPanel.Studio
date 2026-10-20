import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorText, ipc } from "../ipc";
import { entryHeadline, headlineShortens, parseChangelog, renderMarkdown, sectionEntries, sectionTone, shortDate, type Release, type SectionTone } from "../model/changelog";
import { useFound, useStore } from "../store";

const TONE_CLASS: Record<SectionTone, string> = {
  green: "bg-s-green/14 text-[oklch(0.84_0.14_150)]",
  blue: "bg-s-accent/14 text-s-accent-text",
  amber: "bg-s-amber/14 text-s-amber",
  neutral: "bg-[#24242b] text-s-t2",
};

const releaseId = (r: Release) => `release-${r.version}`;

/** Headlines shown per category before "Show all". */
const HEADLINES = 4;

const changeCount = (r: Release) => r.sections.reduce((n, s) => n + sectionEntries(s.body).length, 0);

/** The id of the release in view: the first one crossing the top band of the scrolling page. */
function useScrollSpy(releases: Release[], root: HTMLElement | null): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!root || releases.length === 0) return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = releases.map(releaseId).find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { root, rootMargin: "0px 0px -70% 0px" }
    );
    for (const r of releases) {
      const el = root.querySelector(`[id="${releaseId(r)}"]`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [releases, root]);
  return active ?? (releases[0] ? releaseId(releases[0]) : null);
}

export function ChangelogSection() {
  const { status, toast } = useStore();
  const [source, setSource] = useState<string | null>(null);
  // Older releases start collapsed; a category shows its headlines until "Show all".
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [all, setAll] = useState<Set<string>>(new Set());
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const found = useFound("changelog");

  useEffect(() => {
    let alive = true;
    void ipc.changelog().then((s) => alive && setSource(s)).catch((e) => toast(errorText(e), true));
    return () => {
      alive = false;
    };
  }, [toast]);
  useEffect(() => setRoot(wrap.current?.closest<HTMLElement>("[data-scroll-root]") ?? null), [source]);

  const releases = useMemo(() => (source ? parseChangelog(source) : []), [source]);
  const active = useScrollSpy(releases, root);

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (!next.delete(key)) next.add(key);
    return next;
  };
  const isOpen = (r: Release, i: number) => (i === 0) !== opened.has(r.version);
  const jump = (r: Release, i: number) => {
    if (!isOpen(r, i)) setOpened((o) => toggle(o, r.version));
    // After the release has expanded, so the scroll lands on its final position.
    requestAnimationFrame(() =>
      wrap.current?.querySelector(`[id="${releaseId(r)}"]`)?.scrollIntoView?.({ behavior: "smooth", block: "start" })
    );
  };
  // Links in the notes open in the default browser.
  const onClick = (e: MouseEvent) => {
    const link = (e.target as Element).closest<HTMLAnchorElement>("a[data-external]");
    if (!link) return;
    e.preventDefault();
    void ipc.openExternal(link.href).catch((err) => toast(errorText(err), true));
  };

  if (source === null) return null;
  return (
    <div ref={wrap} className="flex flex-wrap items-start gap-x-7 gap-y-4">
      <div className={cn("sticky top-5 flex w-[172px] shrink-0 flex-col gap-0.5", found.className)} ref={found.ref}>
        {releases.map((r, i) => {
          const on = active === releaseId(r);
          return (
            <button
              key={r.version}
              type="button"
              aria-current={on ? "true" : undefined}
              onClick={() => jump(r, i)}
              className={cn(
                "flex cursor-pointer flex-col gap-px border-0 border-l-2 bg-transparent px-2.5 py-[7px] text-left",
                on ? "border-l-s-accent text-s-t1" : "border-l-transparent text-s-muted hover:text-s-t1"
              )}
            >
              <span className="font-mono text-[13px] font-medium">{r.version}</span>
              {r.date && <span className="text-[11px] text-s-dim">{shortDate(r.date)}</span>}
            </button>
          );
        })}
      </div>
      <div className="min-w-0 flex-1 basis-[280px]" onClick={onClick}>
        <div className="flex flex-col gap-7">
          {releases.map((r, i) => {
            const open = isOpen(r, i);
            const count = changeCount(r);
            return (
              <article key={r.version} id={releaseId(r)} className="flex flex-col gap-3 border-b border-s-divider pb-7">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpened((o) => toggle(o, r.version))}
                  className="flex w-full cursor-pointer flex-wrap items-baseline gap-x-2.5 gap-y-1 border-0 bg-transparent p-0 text-left text-s-t1"
                >
                  <ChevronRight className={cn("h-4 w-4 shrink-0 self-center text-s-dim transition-transform", open && "rotate-90")} />
                  <span className="font-mono text-xl font-semibold tracking-[-0.01em]">{r.version}</span>
                  {r.date && <span className="text-[12.5px] text-s-dim">{shortDate(r.date)}</span>}
                  {r.version === status.appVersion && <span className="rounded-[10px] bg-s-green/14 px-2 py-0.5 text-[11px] font-medium text-[oklch(0.84_0.14_150)]">Installed</span>}
                  {count > 0 && <span className="text-[12.5px] text-s-dim">{count === 1 ? "1 change" : `${count} changes`}</span>}
                </button>
                {open && r.intro && <div className="notes" dangerouslySetInnerHTML={{ __html: renderMarkdown(r.intro) }} />}
                {open &&
                  r.sections.map((s) => {
                    const key = `${r.version}/${s.title}`;
                    const entries = sectionEntries(s.body);
                    const expanded = all.has(key);
                    return (
                      <div key={s.title} className="flex flex-col gap-1.5">
                        <div>
                          <span className={cn("rounded-[5px] px-2 py-0.5 text-[11px] font-semibold tracking-[0.02em]", TONE_CLASS[sectionTone(s.title)])}>{s.title}</span>
                        </div>
                        {expanded ? (
                          <div className="notes" dangerouslySetInnerHTML={{ __html: renderMarkdown(s.body) }} />
                        ) : (
                          <div className="notes">
                            <ul>
                              {entries.slice(0, HEADLINES).map((e, n) => (
                                <li key={n} dangerouslySetInnerHTML={{ __html: entryHeadline(e) }} />
                              ))}
                            </ul>
                          </div>
                        )}
                        {!expanded && (entries.length > HEADLINES || entries.some(headlineShortens)) && (
                          <div>
                            <button
                              type="button"
                              onClick={() => setAll((a) => toggle(a, key))}
                              className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] text-s-accent-text hover:text-s-t1"
                            >
                              Show all ({entries.length})
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
