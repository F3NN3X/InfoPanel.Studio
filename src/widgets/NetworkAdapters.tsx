import type { ModuleSettings } from "@/modules/types";
import { useFitRows, Widget, shell, get, num, fmt, has, Dot, Chip, Icon, type ShellProps } from "./kit";
import { meta } from "./meta/NetworkAdapters";

export { meta };

const speedLabel = (mbps: number) => (mbps >= 1000 ? `${fmt(mbps / 1000, mbps % 1000 ? 1 : 0)} Gbps` : `${fmt(mbps)} Mbps`);

export interface NetworkAdaptersProps extends ShellProps {
  look?: ModuleSettings;
  /** List adapters that are down too (default false). */
  showDown?: boolean;
  /** Show the IPv6 count (default: lg only). */
  showIpv6?: boolean;
  /** Blur addresses until hovered. */
  hideIp?: boolean;
}

export default function NetworkAdapters(p: NetworkAdaptersProps) {
  const d = p.data;
  const ids = [...new Set(Object.keys(d || {}).map((k) => k.match(/^plugins\.network-info-plugin\.(\{[^}]+\})\.name$/)?.[1]).filter((x): x is string => !!x))];
  const ads = ids
    .map((id) => {
      const k = (s: string) => get(d, `plugins.network-info-plugin.${id}.${s}`);
      const v6: string[] = [];
      for (let i = 0; i < 16; i++) {
        const v = k(`ipv6-${i}`);
        if (!has(v)) break;
        v6.push(v);
      }
      return { id, name: k("name"), desc: k("description"), up: k("status") === "Up", speed: num(k("speed")), v4: k("ipv4-0"), v6 };
    })
    .filter((a) => p.showDown || a.up);
  const pub4 = get(d, "plugins.network-info-plugin.public-ip.ipv4"),
    pub6 = get(d, "plugins.network-info-plugin.public-ip.ipv6");
  const ip = (v: string) => <span className={`font-mono tabular-nums ${p.hideIp ? "blur-[4px] hover:blur-0" : ""}`}>{v}</span>;
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Network"}
      icon="lan"
      studio={{ label: "Network", value: pub4, kind: "text", sub: "Public IP", rows: ads.map((a) => ({ n: a.name, v: a.v4, dot: a.up })) }}
      compact={{ label: "Public IP", value: pub4, kind: "text", sub: `${ads.filter((a) => a.up).length} adapters up`, icon: "public" }}
      right={<Chip>{ads.filter((a) => a.up).length} up</Chip>}
    >
      {({ size, h }) => {
        const pub = (
          <div className="flex min-w-0 items-center gap-2">
            <Icon name="public" className="text-lg text-[color:var(--accent)]" />
            <div className="flex min-w-0 flex-col">
              <span className="text-[10.5px] text-[color:var(--w-faint)]">Public IP</span>
              <span className={`${size === "xs" ? "text-sm" : "text-base"} truncate font-semibold`}>{ip(pub4)}</span>
            </div>
            {size === "lg" && has(pub6) && <span className="ml-auto truncate text-[11px] text-[color:var(--w-faint)]">{ip(pub6)}</span>}
          </div>
        );
        if (size === "xs") return <div className="flex h-full items-center">{pub}</div>;
        // under the public IP: an 8px gap, the 1px rule and 8px padding; a list without room for one adapter is left out
        const room = h - 58,
          rowH = size === "lg" ? 46 : 35;
        const n = room >= rowH ? useFitRows(room, rowH, 8) : 0;
        return (
          <div className="flex h-full flex-col gap-2">
            {pub}
            {n > 0 && <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden border-t border-[color:var(--w-track)] pt-2">
              {ads.slice(0, n).map((a) => (
                <li key={a.id} className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex min-w-0 items-center gap-2 text-xs">
                    <Dot ok={a.up} />
                    <span className="truncate font-medium text-[color:var(--w-fg)]">{a.name}</span>
                    <span className="ml-auto shrink-0 tabular-nums text-[color:var(--w-muted)]">{a.up ? speedLabel(a.speed) : "Down"}</span>
                  </div>
                  <div className="flex min-w-0 gap-2 pl-3.5 text-[11px] text-[color:var(--w-faint)]">
                    {ip(a.v4)}
                    {size === "lg" && <span className="truncate">{a.desc}</span>}
                    {(p.showIpv6 ?? size === "lg") && a.v6.length > 0 && <span className="ml-auto shrink-0">+{a.v6.length} IPv6</span>}
                  </div>
                </li>
              ))}
            </ul>}
          </div>
        );
      }}
    </Widget>
  );
}
