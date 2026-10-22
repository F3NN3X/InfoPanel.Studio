import {
  collectMetrics,
  createRateLimiter,
  getDebug,
  isTauri,
  logFrontend,
  reportMetrics,
  type FrontendLevel,
} from "@/lib/desktop";
import { openEventSourceCount } from "@/lib/sensor-store";

const LIMIT = 20;
const WINDOW_MS = 10_000;
const METRICS_MS = 30_000;
/**
 * Chromium's notice that a ResizeObserver pass left some notifications for the next frame: nothing failed, so it
 * is logged as a warning, not an error.
 */
const BENIGN_ERROR = /^ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;

const text = (v: unknown): string => {
  if (v instanceof Error) return v.stack ?? `${v.name}: ${v.message}`;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
};

/**
 * Forward studio errors to the app log and, in debug mode, sample health every 30 s.
 * Debug off: only uncaught errors go. Returns the cleanup (unmount / HMR).
 */
export function startDesktopDebug(): () => void {
  if (!isTauri()) return () => {};
  let stopped = false;
  let sending = false; // a send that logs again must not recurse
  const cleanups: Array<() => void> = [];
  const limiter = createRateLimiter(LIMIT, WINDOW_MS);

  const send = (level: FrontendLevel, message: string) => {
    if (sending) return;
    sending = true;
    try {
      const { send: ok, suppressed } = limiter();
      if (suppressed > 0) void logFrontend("warn", `suppressed ${suppressed} frontend messages`).catch(() => {});
      if (ok) void logFrontend(level, message).catch(() => {});
    } finally {
      sending = false;
    }
  };

  const onError = (e: ErrorEvent) => {
    const stack = e.error instanceof Error && e.error.stack ? `\n${e.error.stack}` : "";
    send(BENIGN_ERROR.test(e.message) ? "warn" : "error", `${e.message} (${e.filename}:${e.lineno}:${e.colno})${stack}`);
  };
  const onRejection = (e: PromiseRejectionEvent) => send("error", `unhandled rejection: ${text(e.reason)}`);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  cleanups.push(
    () => window.removeEventListener("error", onError),
    () => window.removeEventListener("unhandledrejection", onRejection)
  );

  getDebug()
    .then((debug) => {
      if (stopped || !debug) return;
      for (const level of ["error", "warn"] as const) {
        const original = console[level];
        console[level] = (...args: unknown[]) => {
          original.apply(console, args);
          send(level, args.map(text).join(" "));
        };
        cleanups.push(() => {
          console[level] = original;
        });
      }
      const timer = window.setInterval(() => {
        void reportMetrics(collectMetrics(openEventSourceCount())).catch(() => {});
      }, METRICS_MS);
      cleanups.push(() => window.clearInterval(timer));
    })
    .catch(() => {});

  return () => {
    stopped = true;
    for (const c of cleanups) c();
  };
}
