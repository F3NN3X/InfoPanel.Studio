/**
 * The setup's check runs (SPEC §4): one at a time, a new run cancels the one in flight and only the latest run's
 * results land. A check that failed or warned earlier in the session and then passes is `fixed` until setup closes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CHECK_IDS, runChecks, type CheckId, type Probes, type Results, type RunInput } from "./checks";

export interface ChecksState {
  results: Results;
  /** When each running check started (ms epoch), for the elapsed counter. */
  started: Partial<Record<CheckId, number>>;
  fixed: ReadonlySet<CheckId>;
  /** How many times each check has been reset by a run: a row's own open state starts over with it. */
  runs: Partial<Record<CheckId, number>>;
  /** Run from a check; `input` overrides the current address or mode (an edit that hasn't rendered yet). */
  run: (from: CheckId, input?: Partial<RunInput>) => void;
}

export function useChecks(probes: Probes, input: RunInput): ChecksState {
  const [results, setResults] = useState<Results>({});
  const [started, setStarted] = useState<Partial<Record<CheckId, number>>>({});
  const [fixed, setFixed] = useState<ReadonlySet<CheckId>>(() => new Set());
  const [runs, setRuns] = useState<Partial<Record<CheckId, number>>>({});
  const inputRef = useRef(input);
  inputRef.current = input;
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const issues = useRef(new Set<CheckId>());
  const current = useRef<AbortController | null>(null);

  const run = useCallback(
    (from: CheckId, override?: Partial<RunInput>) => {
      current.current?.abort();
      const controller = new AbortController();
      current.current = controller;
      const reset = CHECK_IDS.slice(CHECK_IDS.indexOf(from));
      const prior = resultsRef.current;
      setResults((r) => {
        const next = { ...r };
        for (const id of reset) delete next[id];
        return next;
      });
      setRuns((r) => Object.fromEntries(CHECK_IDS.map((id) => [id, (r[id] ?? 0) + (reset.includes(id) ? 1 : 0)])));
      void (async () => {
        try {
          for await (const { id, result } of runChecks({ ...inputRef.current, ...override }, probes, from, prior, controller.signal)) {
            if (controller.signal.aborted) return;
            if (result.status === "checking") setStarted((s) => ({ ...s, [id]: Date.now() }));
            if (result.status === "fail" || result.status === "warn") issues.current.add(id);
            if (result.status === "ok" && issues.current.has(id)) setFixed((f) => new Set(f).add(id));
            setResults((r) => ({ ...r, [id]: result }));
          }
        } catch {
          // A probe that threw (or the run was cancelled): the rows it left stay as they are until the next run.
        }
      })();
    },
    [probes],
  );

  useEffect(() => () => current.current?.abort(), []);
  return { results, started, fixed, runs, run };
}
