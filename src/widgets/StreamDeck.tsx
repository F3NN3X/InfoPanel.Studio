import { imageUrl } from "@/lib/image";
import type { ModuleSettings } from "@/modules/types";
import { containers } from "./entries";
import { Widget, shell, has, Empty, Icon, type ShellProps, type WidgetMeta } from "./kit";

const P = "plugins.InfoPanel.StreamDeck.";

export const meta: WidgetMeta = {
  id: "StreamDeck",
  name: "Stream Deck",
  category: "Generic",
  icon: "grid_view",
  prefixes: [P],
  defaultSize: [4, 3],
  minSize: [3, 2],
  blurb: "Stream Deck keys with icons and labels",
  tags: "elgato buttons keys",
  description: "Elgato Stream Deck keys with their icons and labels, one grid per connected device.",
};

export interface StreamDeckProps extends ShellProps {
  look?: ModuleSettings;
  /** The active profile next to the device name (default true). */
  showProfile?: boolean;
  /** The key labels under the icons (default true). */
  showLabels?: boolean;
}

interface Key {
  key: string;
  col: number;
  row: number;
  label?: string;
  icon?: string;
}

interface Deck {
  id: string;
  name: string;
  profile?: string;
  keys: Key[];
}

/** "col,row" at the end of a button entry id. */
function coords(suffix: string): { col: number; row: number } {
  const comma = suffix.indexOf(",");
  if (comma < 0) return { col: 0, row: 0 };
  return { col: parseInt(suffix.slice(0, comma), 10) || 0, row: parseInt(suffix.slice(comma + 1), 10) || 0 };
}

/**
 * One deck per container (device serial). A button has a label entry (`btn-<serial>-<col,row>`) and an
 * icon entry (`btn-icon-<serial>-<col,row>`: the plugin's local image server URL, or "-" for none).
 */
function decks(d: ShellProps["data"]): Deck[] {
  return [...containers(d, P).entries()].map(([id, items]) => {
    const text = (suffix: string) => {
      const t = items.find((i) => i.key.endsWith(`.${suffix}`))?.text;
      return has(t) ? t : undefined;
    };
    const keys = items
      .filter((i) => i.key.includes(".btn-icon-"))
      .map((icon): Key => {
        const suffix = icon.key.slice(icon.key.lastIndexOf("btn-icon-") + "btn-icon-".length);
        const label = items.find((i) => i.key === icon.key.replace(".btn-icon-", ".btn-"))?.text;
        return { key: icon.key, ...coords(suffix), label: has(label) ? label : undefined, icon: imageUrl(icon.text, icon.key) };
      })
      .sort((a, b) => a.row - b.row || a.col - b.col);
    return { id, name: text("device-name") ?? id, profile: text("active-profile"), keys };
  });
}

export default function StreamDeck(p: StreamDeckProps) {
  const list = decks(p.data);
  const showProfile = p.showProfile ?? true;
  const showLabels = p.showLabels ?? true;
  const first = list[0];
  const single = list.length === 1;
  const keyName = (k: Key) => k.label ?? `R${k.row + 1}:C${k.col + 1}`;
  const grid = (deck: Deck, labels: boolean) => (
    <div className="grid h-full min-h-0 flex-1 auto-rows-fr gap-2" style={{ gridTemplateColumns: `repeat(${deck.keys.length <= 15 ? 5 : 6}, minmax(0, 1fr))` }}>
      {deck.keys.map((k) => (
        <div key={k.key} className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-1 rounded-lg bg-[color:var(--w-track)] p-1.5" title={keyName(k)}>
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            {k.icon ? (
              <img
                src={k.icon}
                alt=""
                className="max-h-full max-w-full object-contain"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <span className="h-2 w-2 rounded-full bg-[color:var(--w-faint)]" />
            )}
          </div>
          {labels && <div className="w-full shrink-0 truncate text-center text-[10px] text-[color:var(--w-muted)]">{keyName(k)}</div>}
        </div>
      ))}
    </div>
  );
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? (single ? first.name : "Stream Deck")}
      icon="grid_view"
      right={single && showProfile && first.profile ? <span className="max-w-40 truncate text-[color:var(--w-muted)]">{first.profile}</span> : undefined}
      compact={{ label: first?.name ?? "Stream Deck", value: first ? `${first.keys.length} keys` : "–", sub: first?.profile ?? "", kind: "text", icon: "grid_view" }}
      studio={{ label: first?.name ?? "Stream Deck", value: first ? first.keys.length : "–", unit: "keys", sub: first?.profile, rows: (first?.keys ?? []).map((k) => ({ n: keyName(k), v: `R${k.row + 1}:C${k.col + 1}` })) }}
    >
      {({ size, w }) => {
        // a deck with neither keys nor a profile to show has nothing to draw
        const shown = list.filter((deck) => deck.keys.length > 0 || (showProfile && deck.profile));
        if (shown.length === 0) return <Empty icon="grid_view" label="No Stream Deck" />;
        const labels = showLabels && size !== "xs";
        return (
          <div className="grid h-full min-h-0 auto-rows-fr gap-3" style={{ gridTemplateColumns: shown.length > 1 && w >= 700 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)" }}>
            {shown.map((deck) => (
              <div key={deck.id} className="flex min-h-0 flex-col gap-2">
                {!single && (
                  <div className="flex shrink-0 items-center gap-1.5 text-xs text-[color:var(--w-muted)]">
                    <Icon name="grid_view" className="text-sm text-[color:var(--accent)]" />
                    <span className="truncate" title={deck.name}>
                      {deck.name}
                    </span>
                    {showProfile && deck.profile && (
                      <span className="ml-auto max-w-40 truncate text-[color:var(--w-faint)]" title={deck.profile}>
                        {deck.profile}
                      </span>
                    )}
                  </div>
                )}
                {deck.keys.length > 0 ? grid(deck, labels) : <div className="text-sm text-[color:var(--w-fg)]/85">{deck.profile}</div>}
              </div>
            ))}
          </div>
        );
      }}
    </Widget>
  );
}
