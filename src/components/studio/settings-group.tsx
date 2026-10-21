import { useEffect, useRef, useState, type ReactNode } from "react";
import { Copy } from "lucide-react";

/** A Settings group (SPEC §10.1): its title, a scope note, then its rows, in the 560 px column. */
export function SettingsGroup({ id, title, scope, children }: { id: string; title: string; scope?: string; children: ReactNode }) {
  return (
    <section data-nav-section={id} className="mb-[22px] flex flex-col gap-1">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="m-0 text-[13px] font-semibold text-ui-1">{title}</h2>
        {scope && <span className="text-[11px] text-[#7c7c86]">{scope}</span>}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

/** A read-only row: label, value in mono, and an optional Copy. */
export function ReadRow({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = () => {
    clearTimeout(timer.current);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex min-h-[30px] items-center gap-2.5 text-[12.5px]">
      <span className="w-[120px] shrink-0 text-ui-3">{label}</span>
      <span className="min-w-0 flex-1 truncate font-ui-mono text-[11.5px] text-ui-1" title={value}>
        {value}
      </span>
      {copy && (
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(value).then(flash, () => {})}
          className="flex shrink-0 items-center gap-1 rounded-sm text-[11.5px] text-ui-accent-text hover:underline"
        >
          <Copy className="h-3 w-3" />
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}
