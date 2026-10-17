/**
 * Replace by name (spec §3): the picked files grouped by what happens to them. An ambiguous file
 * takes the target the user picks; Apply replaces everything in one edit of the doc.
 */
import { useMemo, useState, type ReactNode } from "react";
import { formatBytes } from "@/lib/assets";
import { assetKey, type AssetFile, type Doc } from "@/lib/infopanel/assets/assets";
import { applyBulk, matchByName } from "@/lib/infopanel/assets/bulk";
import { candidatesFor, withPicks } from "@/lib/infopanel/assets/stored-doc";
import type { Edit } from "./use-profile-doc";
import { BUTTON, Drawer, PRIMARY } from "./drawer";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[.06em] text-ui-4">{title}</h3>
      <ul className="space-y-1 text-[12px] text-ui-2">{children}</ul>
    </section>
  );
}

const name = "truncate font-ui-mono";

export function ReplaceDrawer({ doc, files, onClose, onApply }: { doc: Doc; files: AssetFile[]; onClose: () => void; onApply: (edit: Edit) => void }) {
  const plan = useMemo(() => matchByName(doc.assets, files), [doc, files]);
  const [picks, setPicks] = useState<ReadonlyMap<string, string>>(new Map());
  const matches = withPicks(plan, files, picks);
  const apply = () => {
    onApply({ doc: applyBulk(doc, matches), message: `${matches.length} replaced` });
    onClose();
  };

  return (
    <Drawer
      title="Replace by name"
      onClose={onClose}
      footer={
        <>
          <span className="min-w-0 flex-1 text-[12px] text-ui-3">{matches.length} to replace</span>
          <button type="button" onClick={onClose} className={BUTTON}>
            Cancel
          </button>
          <button type="button" disabled={matches.length === 0} onClick={apply} className={PRIMARY}>
            Apply
          </button>
        </>
      }
    >
      {matches.length > 0 && (
        <Group title={`Will replace (${matches.length})`}>
          {matches.map((m) => (
            <li key={m.target} className="flex gap-2">
              <span className={`${name} min-w-0 flex-1`}>
                {m.target} ← {m.file.name}
              </span>
              <span className="shrink-0 font-ui-mono text-ui-4">
                {formatBytes(doc.assets.get(assetKey(m.target))!.bytes.length)} → {formatBytes(m.file.bytes.length)}
                {m.byStem && " · other type"}
              </span>
            </li>
          ))}
        </Group>
      )}
      {plan.same.length > 0 && (
        <Group title={`Identical, skipped (${plan.same.length})`}>
          {plan.same.map((n) => (
            <li key={n} className={name}>
              {n}
            </li>
          ))}
        </Group>
      )}
      {plan.ambiguous.length > 0 && (
        <Group title={`Ambiguous (${plan.ambiguous.length})`}>
          {plan.ambiguous.map((n) => {
            const file = files.find((f) => f.name === n)!;
            return (
              <li key={n} className="flex items-center gap-2">
                <span className={`${name} min-w-0 flex-1`}>{n}</span>
                <select
                  aria-label={`Target for ${n}`}
                  value={picks.get(n) ?? ""}
                  onChange={(e) => setPicks(new Map(picks).set(n, e.target.value))}
                  className="h-[28px] max-w-[190px] rounded-[6px] border border-ui-default bg-ui-app px-1.5 font-ui-mono text-[12px] text-ui-1"
                >
                  <option value="">Skip</option>
                  {candidatesFor(doc.assets, file).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </Group>
      )}
      {plan.unmatched.length > 0 && (
        <Group title={`No match (${plan.unmatched.length})`}>
          {plan.unmatched.map((n) => (
            <li key={n} className={`${name} text-ui-4`}>
              {n}
            </li>
          ))}
        </Group>
      )}
    </Drawer>
  );
}
