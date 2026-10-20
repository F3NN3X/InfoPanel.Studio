import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { errorText, ipc } from "../ipc";
import { parseChangelog, renderMarkdown, sectionTone, shortDate, type Release, type SectionTone } from "../model/changelog";
import { useFound, useStore } from "../store";
import { Segmented } from "../ui";

const TONE_CLASS: Record<SectionTone, string> = {
  green: "bg-s-green/14 text-[oklch(0.84_0.14_150)]",
  blue: "bg-s-accent/14 text-s-accent-text",
  amber: "bg-s-amber/14 text-s-amber",
  neutral: "bg-[#24242b] text-s-t2",
};

const releaseId = (r: Release) => `release-${r.version}`;

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
  const [mode, setMode] = useState<"read" | "markdown">("read");
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
  useEffect(() => setRoot(wrap.current?.closest<HTMLElement>("[data-scroll-root]") ?? null), [source, mode]);

  const releases = useMemo(() => (source ? parseChangelog(source) : []), [source]);
  const active = useScrollSpy(releases, mode === "read" ? root : null);

  const jump = (r: Release) => wrap.current?.querySelector(`[id="${releaseId(r)}"]`)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
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
        <Segmented
          label="View"
          size="sm"
          stretch
          className="mb-2.5"
          options={[
            { value: "read", label: "Read" },
            { value: "markdown", label: "Markdown" },
          ]}
          value={mode}
          onChange={setMode}
        />
        {releases.map((r) => {
          const on = active === releaseId(r);
          return (
            <button
              key={r.version}
              type="button"
              aria-current={on ? "true" : undefined}
              onClick={() => jump(r)}
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
        {mode === "read" ? (
          <div className="flex flex-col gap-7">
            {releases.map((r) => (
              <article key={r.version} id={releaseId(r)} className="flex flex-col gap-3 border-b border-s-divider pb-7">
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <span className="font-mono text-xl font-semibold tracking-[-0.01em]">{r.version}</span>
                  {r.date && <span className="text-[12.5px] text-s-dim">{shortDate(r.date)}</span>}
                  {r.version === status.appVersion && <span className="rounded-[10px] bg-s-green/14 px-2 py-0.5 text-[11px] font-medium text-[oklch(0.84_0.14_150)]">Installed</span>}
                </div>
                {r.intro && <div className="notes" dangerouslySetInnerHTML={{ __html: renderMarkdown(r.intro) }} />}
                {r.sections.map((s) => (
                  <div key={s.title} className="flex flex-col gap-1.5">
                    <div>
                      <span className={cn("rounded-[5px] px-2 py-0.5 text-[11px] font-semibold tracking-[0.02em]", TONE_CLASS[sectionTone(s.title)])}>{s.title}</span>
                    </div>
                    <div className="notes" dangerouslySetInnerHTML={{ __html: renderMarkdown(s.body) }} />
                  </div>
                ))}
              </article>
            ))}
          </div>
        ) : (
          <pre className="m-0 whitespace-pre-wrap rounded-xl border border-s-card-line bg-s-well p-[18px] font-mono text-[12.5px] leading-[1.7] text-s-t2">{source}</pre>
        )}
      </div>
    </div>
  );
}
