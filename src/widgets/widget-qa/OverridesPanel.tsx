import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FIELD_BOX } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { PanelHead, Pick, Row } from "./bar-fields";
import { settingsError } from "./changes";
import { ACCENTS, GRAPHS, METERS, RADII, SKINS, SURFACES, VARIANTS } from "./options";
import type { QaState } from "./params";

const DENSITY: Record<string, string> = { default: "Standard", studio: "Dense" };

/** The raw settings JSON: edited as a draft, applied on Apply, Ctrl+Enter or leaving the box when it parses; the error shows under it. */
function SettingsJson({ value, onApply }: { value: string; onApply: (settings: string) => void }) {
  const [draft, setDraft] = useState(value);
  // a chip's × or Reset all changes it from outside
  useEffect(() => setDraft(value), [value]);
  const error = settingsError(draft);
  const apply = () => !error && draft !== value && onApply(draft.trim());
  return (
    <div className="space-y-1">
      <Row id="settings" as="div" className="items-start">
        <textarea
          aria-label="Settings JSON"
          aria-invalid={!!error}
          aria-describedby={error ? "qa-settings-error" : undefined}
          spellCheck={false}
          rows={3}
          value={draft}
          placeholder='{"surface": "glass"}'
          onChange={(e) => setDraft(e.target.value)}
          onBlur={apply}
          onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && apply()}
          className={cn(FIELD_BOX, "h-auto w-full resize-y px-2 py-1 font-ui-mono text-micro")}
        />
      </Row>
      <div className="flex items-start justify-between gap-2 pl-[calc(6.5rem+0.5rem)]">
        <p id="qa-settings-error" className={cn("min-w-0 text-micro", error ? "text-ui-danger-text" : "text-ui-3")}>
          {error ?? (draft === value ? "Applied over every placement." : "Ctrl+Enter or Apply")}
        </p>
        <Button small disabled={!!error || draft === value} onClick={apply}>
          Apply
        </Button>
      </div>
    </div>
  );
}

/** The Overrides popover: what goes over every placement's own settings (`placementSettings`), under the worn Look. */
export function OverridesPanel({ state, onChange }: { state: QaState; onChange: (patch: Partial<QaState>) => void }) {
  return (
    <div className="w-84 space-y-2">
      <PanelHead title="Overrides" line="Over every widget's own settings, under the worn Look. Blank leaves each widget's own." />
      <Pick id="skin" value={state.skin} options={SKINS} blank="Default skin" onChange={(skin) => onChange({ skin })} />
      <Pick id="variant" value={state.variant} options={VARIANTS} label={(v) => DENSITY[v] ?? v} blank="Widget's own" onChange={(variant) => onChange({ variant })} />
      <Pick id="surface" value={state.surface} options={SURFACES} blank="Skin's card" onChange={(surface) => onChange({ surface })} />
      <Pick id="graph" value={state.graph} options={GRAPHS} blank="Widget's own" onChange={(graph) => onChange({ graph })} />
      <Pick id="meter" value={state.meter} options={METERS} blank="Widget's own" onChange={(meter) => onChange({ meter })} />
      <Row id="accent" as="div">
        <span className="flex items-center gap-1.5">
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Accent ${c}`}
              aria-pressed={state.accent === c}
              onClick={() => onChange({ accent: state.accent === c ? "" : c })}
              className={cn("size-4.5 rounded-full border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent", state.accent === c ? "border-ui-1" : "border-transparent")}
              style={{ background: c }}
            />
          ))}
          <input type="color" aria-label="Accent colour" className="h-6 w-7 cursor-pointer bg-transparent" value={state.accent || "#888888"} onChange={(e) => onChange({ accent: e.target.value })} />
        </span>
      </Row>
      <Pick id="radius" value={state.radius} options={RADII} blank="Widget's own" onChange={(radius) => onChange({ radius })} />
      <div className="border-t border-ui-subtle pt-2">
        <SettingsJson value={state.settings} onApply={(settings) => onChange({ settings })} />
      </div>
    </div>
  );
}
