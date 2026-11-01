/**
 * The Fonts view's right pane for a selected font (spec §3): a large sample in its own face, the
 * family, and its origin, faces, size, embedding permission and licence, with the licence line.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/assets";
import type { LibraryItem } from "@/lib/library";
import type { Verdict } from "@/lib/infopanel/font-licence";
import { LICENCE_LABEL } from "@/lib/infopanel/font-requests";
import { metaOf } from "@/lib/my-library/model";
import { useLibraryFont } from "../asset-thumb";
import { VERDICT_TONE } from "./requested-table";

const LICENCE_LINE: Record<Verdict, string> = {
  share: "Open license. It can be embedded in exports and shared.",
  check: "No recognized license in the file. Check it before sharing a canvas that carries this font.",
  keep: "Its license or embedding bits do not allow passing it on. Exports leave it out unless you keep it.",
};

export function Fact({ label, children, tone }: { label: string; children: ReactNode; tone?: string }) {
  return (
    <div className="flex gap-3 py-[3px] text-[12px]">
      <span className="w-[86px] shrink-0 text-ui-4">{label}</span>
      <span className={cn("min-w-0 flex-1 truncate text-ui-2", tone)}>{children}</span>
    </div>
  );
}

export function PreviewBox({ family }: { family: string | null }) {
  return (
    <div className="rounded-[12px] border border-ui-subtle bg-ui-tile p-4">
      <div className="truncate text-[40px] leading-tight text-ui-1" style={{ fontFamily: family ? `"${family}"` : undefined }}>
        Aa 54°
      </div>
      <div className="mt-1 truncate text-[12px] text-ui-3" style={{ fontFamily: family ? `"${family}"` : undefined }}>
        The quick brown fox · 0123456789
      </div>
    </div>
  );
}

export function FontDetail({ item }: { item: LibraryItem }) {
  const m = metaOf(item);
  const face = useLibraryFont(item);
  return (
    <aside aria-label="Font details" className="flex w-[320px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-ui-subtle bg-ui-panel p-4 font-ui">
      <PreviewBox family={face} />
      <div className="text-[14px] font-semibold text-ui-1">{m.family ?? item.name}</div>
      <div>
        <Fact label="Origin">{m.origin ?? "Added by you"}</Fact>
        <Fact label="Faces">{m.faces ?? "—"}</Fact>
        <Fact label="Size">{m.size !== undefined ? formatBytes(m.size) : "—"}</Fact>
        <Fact label="Embedding">{m.embedding ?? "—"}</Fact>
        <Fact label="License" tone={m.licence ? VERDICT_TONE[m.licence] : undefined}>
          {m.licence ? LICENCE_LABEL[m.licence] : "—"}
        </Fact>
      </div>
      {m.licence && <p className="text-[12px] leading-snug text-ui-3">{LICENCE_LINE[m.licence]}</p>}
    </aside>
  );
}
