import type { ModuleSettings } from "@/modules/types";
import { entryText } from "./entries";
import { Widget, shell, num, Empty, type ShellProps } from "./kit";
import { meta, P } from "./meta/TextFile";

export { meta };



export interface TextFileProps extends ShellProps {
  look?: ModuleSettings;
  /** The size / lines / status header (default true). */
  showMeta?: boolean;
}

// line height (px) of the xs body; its line count is the height left under the meta line over this
const XS_LINE = 16;

function humanBytes(bytes: number): string | undefined {
  if (!Number.isFinite(bytes) || bytes <= 0) return undefined;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(1)} ${units[u]}`;
}

export default function TextFile(p: TextFileProps) {
  const k = (id: string) => entryText(p.data, P, id);
  const content = k("content");
  const status = k("status");
  const size = humanBytes(num(k("file-size")));
  const lines = num(k("line-count"));
  const hasLines = Number.isFinite(lines) && lines > 0;
  const showMeta = p.showMeta ?? true;
  const body = (content ?? "").split("\n");
  const bits = [size, hasLines ? `${lines} lines` : undefined, status].filter((x): x is string => !!x);
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Text File"}
      icon="description"
      right={
        showMeta && bits.length > 0 ? (
          <span className="flex min-w-0 gap-2 text-[color:var(--w-muted)]">
            {size && <span>{size}</span>}
            {hasLines && <span>{`${lines} lines`}</span>}
            {status && (
              <span className="max-w-48 truncate" title={status}>
                {status}
              </span>
            )}
          </span>
        ) : undefined
      }
      compact={(box) =>
        // a 2x1 tile hides the compact sub line (the file text): lay out the meta line and the first lines instead
        box.shape === "tile" && box.w >= 200 ? undefined : { label: "Text File", value: hasLines ? `${lines} lines` : (status ?? "—"), sub: body[0] ?? "", kind: "text", icon: "description" }
      }
      studio={{ label: "Text File", value: hasLines ? lines : "", unit: hasLines ? "lines" : undefined, sub: [size, status].filter(Boolean).join(" · "), rows: body.slice(0, 8).map((n) => ({ n, v: "" })) }}
    >
      {({ size, h }) =>
        content === undefined && status === undefined ? (
          <Empty icon="description" label="No content" />
        ) : size === "xs" ? (
          // no header at this size: the title and the size / lines / status line sit above the first lines
          <div className="flex h-full min-w-0 flex-col gap-1">
            <div className="flex min-w-0 shrink-0 gap-2 text-[10.5px] text-[color:var(--w-muted)]">
              {p.look?.showTitle !== false && <span className="shrink-0 font-medium uppercase tracking-[0.08em]">{p.title ?? "Text File"}</span>}
              {showMeta && <span className="truncate">{bits.join(" · ")}</span>}
            </div>
            <pre className="min-h-0 flex-1 overflow-hidden whitespace-pre-wrap break-words font-mono text-xs text-[color:var(--w-fg)]/85" style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: Math.max(1, Math.floor((h - 18) / XS_LINE)), lineHeight: `${XS_LINE}px` }}>{content ?? "No content"}</pre>
          </div>
        ) : (
          <pre className="h-full overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[color:var(--w-fg)]/85">{content ?? "No content"}</pre>
        )
      }
    </Widget>
  );
}
