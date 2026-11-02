/**
 * The export's font licence review (§9): one row per supplied font file with the licence verdict
 * and, for one that may not be shared, the choice to include it, leave it out or swap it for a
 * same-category font from My library.
 */
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { VERDICT_LABEL } from "@/lib/infopanel/font-licence";
import { swapOptions, type FontChoice, type FontLicenceRow, type SwapTarget } from "@/lib/infopanel/export/studio-export";

const LICENCE_TONE = { share: "text-ui-success", check: "text-ui-warning", keep: "text-ui-danger" };
const LICENCE_DOT = { share: "bg-ui-success", check: "bg-ui-warning", keep: "bg-ui-danger" };

export interface FontLicenceReviewProps {
  rows: readonly FontLicenceRow[];
  choices: ReadonlyMap<string, FontChoice>;
  targets: readonly SwapTarget[];
  onChoose: (hash: string, choice: FontChoice) => void;
}

export function FontLicenceReview({ rows, choices, targets, onChoose }: FontLicenceReviewProps) {
  const included = rows.filter((r) => r.verdict === "keep" && (choices.get(r.hash) ?? "include") === "include");
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12.5px] font-semibold text-ui-1">Font licenses</span>
      <span className="-mt-1 text-[11.5px] text-ui-4">Review the supplied fonts before sharing this file.</span>
      <div className="flex flex-col rounded-[10px] border border-ui-default">
        {rows.length === 0 && <span className="px-3.5 py-2.5 text-caption text-ui-4">No supplied fonts: the canvas draws InfoPanel’s faces.</span>}
        {rows.map((r) => {
          const choice = choices.get(r.hash) ?? "include";
          const options = swapOptions(r, targets);
          const swap = typeof choice === "object" ? choice.swap : null;
          const kind = typeof choice === "object" ? "swap" : choice;
          const pick = (c: "include" | "leave" | "swap") => onChoose(r.hash, c === "swap" ? { swap: swap ?? options[0] } : c);
          const buttons = options.length > 0 ? (["include", "leave", "swap"] as const) : (["include", "leave"] as const);
          return (
            <div key={r.hash} className="flex flex-col gap-2 border-b border-ui-subtle px-3.5 py-2.5 last:border-b-0">
              <div className="flex items-center gap-2.5">
                <span className={cn("h-[7px] w-[7px] rounded-full", LICENCE_DOT[r.verdict])} />
                <span className="w-[140px] truncate text-[12.5px] font-medium text-ui-1">{r.family}</span>
                <span className="flex-1 truncate text-caption text-ui-3" title={r.reason}>
                  Supplied · {r.file}
                </span>
                <span className={cn("text-[11.5px] capitalize", LICENCE_TONE[r.verdict])}>{VERDICT_LABEL[r.verdict]}</span>
              </div>
              {r.verdict !== "share" && (
                <div className="ml-[17px] flex flex-wrap items-center gap-2 self-start">
                  <div role="radiogroup" aria-label={`${r.family} in the export`} className="flex gap-0.5 rounded-[7px] border border-ui-default bg-ui-raised p-0.5">
                    {buttons.map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={kind === c}
                        onClick={() => pick(c)}
                        className={cn("whitespace-nowrap rounded-[5px] px-2.5 py-1 text-caption", kind === c ? "bg-ui-active text-ui-1" : "text-ui-4 hover:text-ui-1")}
                      >
                        {c === "include" ? "Include anyway" : c === "leave" ? "Leave out" : "Swap for…"}
                      </button>
                    ))}
                  </div>
                  {swap && (
                    <select
                      aria-label={`Swap ${r.family} for`}
                      value={swap.hash}
                      onChange={(e) => onChoose(r.hash, { swap: options.find((t) => t.hash === e.target.value) ?? swap })}
                      className="h-[30px] rounded-[7px] border border-ui-default bg-ui-raised px-2 text-caption text-ui-1"
                    >
                      {options.map((t) => (
                        <option key={t.hash} value={t.hash}>
                          {t.family}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {included.length > 0 && (
        <span className="flex gap-1.5 text-caption text-ui-danger">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {included.map((r) => r.family).join(", ")}: the licence doesn’t allow sharing. The save note will name it.
        </span>
      )}
    </div>
  );
}
