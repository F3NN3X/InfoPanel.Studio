import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip } from "@/components/ui/tooltip";
import type { ResolvedVariant } from "@/looks/look";
import { PanelHead, Pick, Row, Switch } from "./bar-fields";
import { tipOf } from "./help-text";
import type { QaFx, QaState } from "./params";

const EFFECTS: { value: QaFx; label: string; title?: string }[] = [
  { value: "", label: "Default", title: "The screen's own level" },
  { value: "full", label: "Full" },
  { value: "calm", label: "Calm" },
  { value: "off", label: "Off" },
];

interface LookPanelProps {
  state: QaState;
  /** The Looks the picker offers (`qaLookIds`). */
  looks: readonly string[];
  /** The worn Look's variants. */
  variants: readonly ResolvedVariant[];
  /** What the last pack import came to. */
  imported: string;
  onImport: (files: FileList) => void;
  onChange: (patch: Partial<QaState>) => void;
}

/** The Look popover: what the page wears as a screen (`theme.tsx`), before the overrides that go over every placement. */
export function LookPanel({ state, looks, variants, imported, onImport, onChange }: LookPanelProps) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="w-80 space-y-2">
      <PanelHead title="Look" line="What the page wears, as a screen wears it: its tokens, pack CSS, stage and script." />
      <Pick id="look" value={state.look} options={looks} blank="No look" onChange={(look) => onChange({ look, lookVariant: "" })} />
      {variants.length > 0 && <Pick id="lookVariant" value={state.lookVariant} options={variants.map((v) => v.id)} label={(id) => variants.find((v) => v.id === id)?.name ?? id} blank="The Look's own" onChange={(lookVariant) => onChange({ lookVariant })} />}
      <Row id="fx" as="div">
        <Segmented label="Effects" options={EFFECTS} value={state.fx} onChange={(fx) => onChange({ fx })} className="w-fit" />
      </Row>
      <Switch id="script" checked={state.script} onChange={(script) => onChange({ script })} />
      <div className="space-y-1 border-t border-ui-subtle pt-2">
        <input ref={file} type="file" accept=".zip" hidden aria-label="Pack zip" onChange={(e) => e.target.files?.length && onImport(e.target.files)} />
        <Tooltip label={<span className="block max-w-72">{tipOf("importPack")}</span>} side="right" sideOffset={14}>
          <Button small onClick={() => file.current?.click()}>
            Import a pack…
          </Button>
        </Tooltip>
        {imported && (
          <p role="status" className={`text-micro ${imported.startsWith("refused") ? "text-ui-danger-text" : "text-ui-2"}`}>
            {imported}
          </p>
        )}
      </div>
    </div>
  );
}
