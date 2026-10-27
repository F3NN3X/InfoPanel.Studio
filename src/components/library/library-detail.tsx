/**
 * The Library's detail pane (spec §3): a large preview, the name (renamed in place), the primary
 * action by kind, the secondary actions, the duplicate notice with Merge, the theme suggestion,
 * a video's playback and an SVG template's variables, the facts, the auto tags and the copies
 * placed (each jumps to its place).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Copy, Sparkles, Trash2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/assets";
import type { LibraryCopy, LibraryItem } from "@/lib/library";
import { copiesLine, hashOf, isConfigItem, KIND_LABEL, metaLine, metaOf, tagsOf, type LibraryIndex } from "@/lib/my-library/model";
import { AssetThumb } from "./asset-thumb";
import { isSavedPanel } from "./library-actions";

export interface DetailAction {
  label: string;
  icon: LucideIcon;
  run: () => void;
  disabled?: boolean;
  /** Why it is disabled, or what it does. */
  title?: string;
}

export interface DetailProps {
  item: LibraryItem;
  /** Shown in a bottom sheet (a narrow viewport): fills it instead of a 320 px side column. */
  sheet?: boolean;
  index: LibraryIndex;
  primary: DetailAction | null;
  secondary: DetailAction[];
  /** Focus and select the name field (Rename from the card's menu). */
  focusName?: boolean;
  /** The name field took the focus asked for. */
  onFocusedName?: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  onMerge: (group: LibraryItem[]) => void;
  onVideo: (patch: { loop?: boolean; muted?: boolean; poster?: number }) => void;
  /** Where a copy went, as the studio names it ("ARCv2 › Page 1 › Background"), and jump there. */
  copyLabel: (copy: LibraryCopy) => string;
  onJump: (copy: LibraryCopy) => void;
}

const TYPE_LABEL: Record<string, string> = { jpeg: "JPEG", png: "PNG", gif: "GIF", webp: "WebP", avif: "AVIF", bmp: "BMP", ico: "ICO", svg: "SVG", mp4: "MP4", webm: "WebM" };

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-[3px] text-[12px]">
      <span className="w-[86px] shrink-0 text-ui-4">{label}</span>
      <span className="min-w-0 flex-1 truncate font-ui-mono text-ui-2">{children}</span>
    </div>
  );
}

function ActionButton({ action, primary }: { action: DetailAction; primary?: boolean }) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      onClick={action.run}
      disabled={action.disabled}
      title={action.title}
      className={cn(
        "flex h-[34px] items-center justify-center gap-2 rounded-[8px] px-3 text-[12.5px] disabled:pointer-events-none disabled:opacity-40",
        primary ? "w-full bg-ui-inverse font-medium text-ui-inverse-fg hover:opacity-90" : "border border-ui-default text-ui-1 hover:bg-ui-hover",
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
      {action.label}
    </button>
  );
}

export function LibraryDetail(p: DetailProps) {
  const { item } = p;
  const m = metaOf(item);
  const config = isConfigItem(item);
  // A saved panel lives in the config, and is renamed and deleted there; the built-ins are neither.
  const editable = !config || isSavedPanel(item);
  const [name, setName] = useState(item.name);
  const nameRef = useRef<HTMLInputElement>(null);
  const { focusName, onFocusedName } = p;
  useEffect(() => {
    if (!focusName || !nameRef.current) return;
    nameRef.current.focus();
    nameRef.current.select();
    onFocusedName?.();
  }, [focusName, onFocusedName]);
  const group = p.index.groupOf.get(item.id);
  const suggestion = p.index.suggested.find((s) => s.item.id === item.id);
  const hash = hashOf(item);
  const added = Date.parse(item.createdAt);
  const tags = tagsOf(item);
  const copies = config ? [] : item.copies;
  return (
    <aside
      aria-label="Item details"
      className={cn(
        "flex flex-col gap-4 overflow-y-auto bg-ui-panel p-4 font-ui",
        p.sheet ? "min-w-0 flex-1" : "w-[320px] shrink-0 border-l border-ui-subtle",
      )}
    >
      <AssetThumb item={item} size="lg" live className="aspect-[16/10] w-full border border-ui-subtle" />
      <div>
        <input
          aria-label="Name"
          value={name}
          disabled={!editable}
          ref={nameRef}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== item.name && p.onRename(name.trim())}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="w-full rounded-[6px] border border-transparent bg-transparent px-1 py-0.5 -mx-1 text-[14px] font-semibold text-ui-1 outline-none hover:border-ui-default focus:border-ui-accent disabled:hover:border-transparent"
        />
        <div className="font-ui-mono text-[11px] text-ui-4">{metaLine(item) || KIND_LABEL[item.kind]}</div>
      </div>
      <div className="flex flex-col gap-2">
        {p.primary && <ActionButton action={p.primary} primary />}
        {p.secondary.length > 0 && (
          <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">
            {p.secondary.map((a) => (
              <ActionButton key={a.label} action={a} />
            ))}
          </div>
        )}
      </div>
      {group && (
        <div className="rounded-[10px] border border-ui-warning/40 bg-ui-warning/10 p-3 text-[12px] leading-snug text-ui-2">
          <div className="mb-2 flex items-center gap-2 font-medium text-ui-warning">
            <Copy className="h-3.5 w-3.5" /> Duplicate
          </div>
          {group.filter((g) => g.id !== item.id).map((g) => g.name).join(", ")} {group.length === 2 ? "has" : "have"} the same{" "}
          {hash && group.every((g) => hashOf(g) === hash) ? "bytes" : "picture"}. Merging keeps {group[0].name} and moves every copy count to it.
          <button type="button" onClick={() => p.onMerge(group)} className="mt-2 block h-[28px] rounded-[7px] border border-ui-default px-2.5 text-[12px] text-ui-1 hover:bg-ui-hover">
            Merge
          </button>
        </div>
      )}
      {suggestion && (
        <div className="flex gap-2 text-[12px] leading-snug text-ui-accent-text">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Suggested for this theme: {suggestion.reason.charAt(0).toLowerCase() + suggestion.reason.slice(1)}.
        </div>
      )}
      {item.kind === "video" && (
        <div className="space-y-2 border-t border-ui-subtle pt-3">
          <div className="text-[11px] font-medium uppercase tracking-[.06em] text-ui-4">Playback</div>
          <label className="flex items-center justify-between text-[12.5px] text-ui-2">
            Loop
            <input type="checkbox" checked={m.loop ?? m.audio === false} onChange={(e) => p.onVideo({ loop: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--ui-accent)]" />
          </label>
          <label className="flex items-center justify-between text-[12.5px] text-ui-2">
            Muted
            <input type="checkbox" checked={m.muted ?? true} onChange={(e) => p.onVideo({ muted: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--ui-accent)]" />
          </label>
          <label className="block text-[12.5px] text-ui-2">
            <span className="flex justify-between">
              Poster frame <span className="font-ui-mono text-ui-4">{(m.poster ?? 1).toFixed(1)} s</span>
            </span>
            <input
              type="range"
              aria-label="Poster frame"
              min={0}
              max={Math.max(0.1, m.duration ?? 10)}
              step={0.1}
              value={m.poster ?? 1}
              onChange={(e) => p.onVideo({ poster: Number(e.target.value) })}
              className="mt-1 w-full accent-[var(--ui-accent)]"
            />
          </label>
        </div>
      )}
      {item.kind === "svg" && (
        <div className="border-t border-ui-subtle pt-3 text-[12px] text-ui-2">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[.06em] text-ui-4">Driven by</div>
          {m.vars?.length ? (
            <div className="flex flex-wrap gap-1">
              {m.vars.map((v) => (
                <code key={v} className="rounded bg-ui-raised px-1.5 py-0.5 font-ui-mono text-[11px] text-ui-1">
                  {v}
                </code>
              ))}
            </div>
          ) : (
            <span className="text-ui-4">No variables: it draws as a still image.</span>
          )}
        </div>
      )}
      <div className="border-t border-ui-subtle pt-3">
        <Fact label="Type">{m.type ? (TYPE_LABEL[m.type] ?? m.type.toUpperCase()) : KIND_LABEL[item.kind]}</Fact>
        {m.width && m.height ? (
          <Fact label="Size">
            {m.width} × {m.height}
          </Fact>
        ) : null}
        {m.duration !== undefined && <Fact label="Length">{m.duration.toFixed(1)} s</Fact>}
        {m.size !== undefined && <Fact label="File size">{formatBytes(m.size)}</Fact>}
        {m.family && <Fact label="Family">{m.family}</Fact>}
        {!config && Number.isFinite(added) && <Fact label="Added">{new Date(added).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</Fact>}
        {hash && <Fact label="Stored as">sha256 {hash.slice(0, 8)}…</Fact>}
        {config && <Fact label="Kept in">this dashboard’s config</Fact>}
      </div>
      {tags.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] text-ui-4">Tags · auto</div>
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <span key={t} className="rounded-full border border-ui-default px-2 py-0.5 text-[11.5px] text-ui-2">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
      {!config && (
        <div>
          <div className="mb-1.5 text-[11.5px] text-ui-4">{copiesLine(copies.length)}</div>
          <div className="flex flex-col gap-1">
            {copies.map((c, i) => (
              <button
                key={`${c.profileId}:${c.zoneId ?? ""}:${i}`}
                type="button"
                onClick={() => p.onJump(c)}
                // Copies recorded before profiles were tracked ("*") have nowhere to jump to.
                disabled={c.profileId === "*"}
                title={c.profileId === "*" ? "Recorded without a profile" : undefined}
                className="flex h-[30px] items-center gap-2 rounded-[7px] border border-ui-subtle px-2.5 text-left text-[12px] text-ui-2 hover:bg-ui-hover disabled:pointer-events-none disabled:opacity-60"
              >
                <span className="min-w-0 flex-1 truncate">{p.copyLabel(c)}</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-ui-4" />
              </button>
            ))}
          </div>
        </div>
      )}
      {editable && (
        <button type="button" onClick={p.onRemove} className="mt-auto flex items-center gap-1.5 self-start text-[12px] text-ui-4 hover:text-ui-danger">
          <Trash2 className="h-3.5 w-3.5" /> Remove from library
        </button>
      )}
    </aside>
  );
}
