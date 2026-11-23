// Ping: the round-trip time to a host. What the registry needs; the component is its own chunk.
// It reads the dashboard server's own `ping.` readings (`ips-server ping.rs`), which probe only the hosts saved in Ping widgets.
import type { ModuleSettings } from "@/modules/types";
import { CARD, defineWidget } from "../define";
import { numberOf, numberSetting, stringOf, textSetting } from "../shared/settings-kit";
import type { PingProps } from "./Ping";
import { meta } from "./meta";
import { PORT_DEFAULT } from "./target";

/** `value` as a whole number in `lo`..`hi`, else `fallback`. */
const wholeIn = (value: unknown, lo: number, hi: number, fallback: number): number => {
  const n = numberOf(value);
  return n === undefined ? fallback : Math.min(hi, Math.max(lo, Math.round(n)));
};

export default defineWidget({
  meta,
  // A summary card; the dense view falls back to it.
  inspector: { header: "yes", compact: CARD },
  settings: [
    textSetting("host", "Host", "", { group: "Target", tab: "data", hint: "A name or an address, such as 1.1.1.1 or router.local. The server checks only the hosts typed into Ping widgets" }),
    numberSetting("port", "Port", PORT_DEFAULT, { group: "Target", tab: "data", min: 1, max: 65535, step: 1, hint: "The TCP port to connect to; 443 answers on most web hosts" }),
    numberSetting("interval", "Check every (seconds)", 5, { group: "Target", tab: "data", min: 2, max: 60, step: 1 }),
    textSetting("name", "Name", "", { group: "Target", tab: "show", hint: "Shown instead of the host" }),
    numberSetting("warnMs", "Slow from (ms)", 100, { group: "Levels", min: 1, max: 5000, step: 1 }),
    numberSetting("critMs", "Critical from (ms)", 250, { group: "Levels", min: 1, max: 5000, step: 1 }),
  ],
  render: {
    load: () => import("./Ping"),
    toProps: (s: ModuleSettings): Partial<PingProps> => ({
      host: stringOf(s.host),
      name: stringOf(s.name),
      port: wholeIn(s.port, 1, 65535, PORT_DEFAULT),
      warnMs: wholeIn(s.warnMs, 1, 5000, 100),
      critMs: wholeIn(s.critMs, 1, 5000, 250),
    }),
  },
  // Migrations and sample stay central (the default): the sample is src/widgets/__fixtures__/extra.json (`ping.*`) and the
  // widget-qa demo settings name its host. It draws without sensor keys too (module.tsx SENSORLESS): with no host it says so.
});
