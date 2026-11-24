import { Field } from "@/components/ui/field";
import { Tag } from "@/components/ui/tag";
import { Tooltip } from "@/components/ui/tooltip";
import type { DashboardModule } from "@/modules/types";
import { CONTROL_HELP, tipOf } from "./help-text";
import type { QaState } from "./params";

interface NavSection {
  id: string;
  category: string;
  mods: DashboardModule[];
}

/**
 * The row that finds a widget, until the widget list replaces it: the filter, the two "only" filters, a jump list grouped by
 * category and the category links with their counts.
 */
export function WidgetNav({ state, sections, onChange }: { state: QaState; sections: NavSection[]; onChange: (patch: Partial<QaState>) => void }) {
  return (
    <nav aria-label="Widgets" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption">
      <Tooltip label={tipOf("q")} side="bottom">
        <Field aria-label="Filter id or title" placeholder="Filter id or title" className="h-7 w-44 px-2 text-caption" value={state.q} onChange={(e) => onChange({ q: e.target.value })} />
      </Tooltip>
      <Tooltip label={<span className="block max-w-72">{tipOf("flagged")}</span>} side="bottom">
        <Tag selected={state.flagged} onClick={() => onChange({ flagged: !state.flagged })}>
          {CONTROL_HELP.flagged.name}
        </Tag>
      </Tooltip>
      <Tooltip label={tipOf("noted")} side="bottom">
        <Tag selected={state.noted} onClick={() => onChange({ noted: !state.noted })}>
          {CONTROL_HELP.noted.name}
        </Tag>
      </Tooltip>
      {/* Every shown widget by name: picking one jumps to it (its section's anchor is its id). */}
      <select aria-label="Jump to a widget" className="h-7 cursor-pointer rounded-ui-md border border-ui-control bg-ui-chrome px-2 text-caption text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent" value="" onChange={(e) => e.target.value && document.getElementById(e.target.value)?.scrollIntoView()}>
        <option value="">Jump to a widget…</option>
        {sections.map((s) => (
          <optgroup key={s.id} label={s.category}>
            {s.mods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {sections.map((s) => (
        <a key={s.id} href={`#${s.id}`} className="text-ui-2 hover:text-ui-1">
          {s.category} <span className="text-ui-3">{s.mods.length}</span>
        </a>
      ))}
    </nav>
  );
}
