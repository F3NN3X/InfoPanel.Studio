import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { uid } from "@/lib/layout";
import { parsePanelJson, type PanelDef } from "@/lib/panel-model";
import { cn } from "@/lib/utils";
import { FIELD } from "./setting-rows";

interface PanelCodeViewProps {
  panel: PanelDef;
  /** Replace the panel (one undo step). */
  onApply: (panel: PanelDef) => void;
}

/** The toast for a rejected panel JSON: the parser's message after "Invalid JSON — ". */
export const invalidJsonToast = (error: string) => `Invalid JSON — ${error.replace(/^Invalid JSON:\s*/, "")}`;

/**
 * The panel as JSON (README §4.6): edit, then Apply or Ctrl+Enter (checked
 * by `parsePanelJson`; missing or repeated widget ids get fresh ones). Until
 * edited it follows the panel (undo, the visual editor).
 */
export function PanelCodeView({ panel, onApply }: PanelCodeViewProps) {
  const toast = useToast();
  const json = JSON.stringify(panel, null, 2);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const text = draft ?? json;

  const apply = () => {
    const parsed = parsePanelJson(text, () => uid("w"));
    if (!parsed.ok) {
      setError(parsed.error);
      return toast(invalidJsonToast(parsed.error));
    }
    onApply(parsed.panel);
    setDraft(null);
    setError(null);
    toast("Panel updated · one undo step");
  };

  const revert = () => {
    setDraft(null);
    setError(null);
  };

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            apply();
          }
        }}
        spellCheck={false}
        aria-label="Panel JSON"
        aria-invalid={error !== null}
        className={cn(FIELD, "block h-[260px] w-full resize-y py-1.5 font-ui-mono text-[11.5px] leading-relaxed aria-invalid:border-ui-danger")}
      />
      {error && <div className="text-[11.5px] text-ui-danger">{error}</div>}
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-micro text-ui-4">Ctrl+Enter to apply · one undo step</span>
        <button
          type="button"
          onClick={revert}
          disabled={draft === null}
          className="text-[11.5px] text-ui-3 hover:text-ui-1 disabled:opacity-40"
        >
          Revert
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={draft === null}
          className="h-7 rounded-md bg-ui-inverse px-3 text-caption font-medium text-ui-inverse-fg disabled:opacity-40"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
