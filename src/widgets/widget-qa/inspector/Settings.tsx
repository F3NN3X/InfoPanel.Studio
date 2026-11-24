import { useState } from "react";
import { Field } from "@/components/ui/field";
import { categorize, tabOf } from "@/components/studio/inspector-categories";
import { STANDARD_KEYS } from "@/modules/standard-settings";
import type { DashboardModule, ModuleSetting } from "@/modules/types";

const TABS = [
  ["show", "Show"],
  ["style", "Style"],
  ["data", "Data"],
  ["behaviour", "Behaviour"],
] as const;

function SettingRow({ s }: { s: ModuleSetting }) {
  const opts = s.options?.map((o) => o.value).join(" | ");
  return (
    <li title={s.label} className="font-ui-mono text-micro">
      <span className="text-ui-1">{s.key}</span>{" "}
      <span className="text-ui-3">
        {s.type} = {JSON.stringify(s.default)}
      </span>
      {opts && <span className="text-ui-3"> [{opts}]</span>}
    </li>
  );
}

interface Group {
  tab: string;
  label: string;
  sections: { id: string; title: string; general: boolean; defs: ModuleSetting[] }[];
}

/** The settings matching the search, of the widget's own rows or the general ones, per tab and section as the inspector files them. */
function groupsOf(mod: DashboardModule, own: boolean, needle: string): Group[] {
  const shown = (mod.settings ?? []).filter((d) => !d.hidden);
  const cats = categorize(shown);
  const match = (d: ModuleSetting) => !needle || d.key.toLowerCase().includes(needle) || d.label.toLowerCase().includes(needle);
  return TABS.flatMap(([tab, label]) => {
    const sections = cats.flatMap((c) => {
      const defs = c.defs.filter((d) => tabOf(d, c) === tab && STANDARD_KEYS.has(d.key) !== own && match(d));
      return defs.length ? [{ id: `${c.id}-${tab}`, title: c.title, general: c.general, defs }] : [];
    });
    return sections.length ? [{ tab, label, sections }] : [];
  });
}

function Groups({ groups }: { groups: Group[] }) {
  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <div key={g.tab}>
          <p className="text-nano font-semibold uppercase tracking-wider text-ui-3">{g.label}</p>
          {g.sections.map((sec) => (
            <div key={sec.id} className="mt-1">
              <p className="text-micro text-ui-2">
                {sec.title}
                {sec.general && <span className="text-ui-3"> · general</span>}
              </p>
              <ul className="space-y-0.5 pl-2">
                {sec.defs.map((s) => (
                  <SettingRow key={s.key} s={s} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const count = (groups: Group[]) => groups.reduce((n, g) => n + g.sections.reduce((k, s) => k + s.defs.length, 0), 0);

/**
 * The widget's settings as its studio inspector files them (`categorize`, `tabOf`), searchable by key or label: its own rows first,
 * then the general ones (the same on every widget, `STANDARD_KEYS`), folded unless a search finds some.
 */
export function SettingsList({ mod }: { mod: DashboardModule }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const own = groupsOf(mod, true, needle);
  const general = groupsOf(mod, false, needle);
  return (
    <div className="space-y-2">
      <Field aria-label="Search settings" placeholder="Search settings" className="h-7 w-full px-2 text-caption" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="text-micro text-ui-3">{`Its own · ${count(own)}`}</p>
      {own.length ? <Groups groups={own} /> : <p className="text-micro text-ui-3">{needle ? "None match." : "None: every setting is a general one."}</p>}
      <details open={!!needle && general.length > 0} key={needle ? "found" : "all"}>
        <summary className="cursor-pointer text-micro text-ui-3">{`General · ${count(general)}`}</summary>
        <div className="mt-1">
          <Groups groups={general} />
        </div>
      </details>
    </div>
  );
}
