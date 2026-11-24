import type { ReactNode } from "react";
import type { DashboardModule } from "@/modules/types";
import { ClaudeButton } from "../ClaudeButton";
import { claudeText, widgetFiles, type Now } from "../console";
import { noteStatus, noteText, useWidgetNotes } from "../notes";
import { frameId, widgetLinks } from "../params";
import { layoutPlans, viewPlans } from "../plan";
import { select } from "../selection";
import { NoteEditor } from "./NoteEditor";
import { ACTION, Block, Copyable, Facts, Quiet } from "./parts";
import { SettingsList } from "./Settings";

/** A view or layout by name: a click selects its frame and scrolls to it. */
function FrameLinks({ module, items, prefix }: { module: string; items: { id: string; name: string; c: number; r: number }[]; prefix: "view" | "layout" }) {
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {items.map((v) => {
        const id = frameId(module, `${prefix}:${v.id}`);
        return (
          <button
            key={v.id}
            type="button"
            title={`Select the ${v.name} frame`}
            onClick={() => {
              select(id);
              document.getElementById(id)?.scrollIntoView({ block: "nearest" });
            }}
            className="rounded-ui-sm text-ui-2 underline decoration-current/30 underline-offset-2 hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-ui-accent"
          >
            {v.name} <span className="font-ui-mono text-micro text-ui-3">{`${v.c}x${v.r}`}</span>
          </button>
        );
      })}
    </span>
  );
}

/**
 * The selected widget (or the selected frame's): what the info column beside its frames used to hold. Its title, id and category,
 * minimum and default size, the data it reads, its blurb and description, tags, views and layouts, its notes (its own to edit), its files as copyable
 * paths (`files.generated.ts`) and its settings, searchable.
 */
export function WidgetPart({ mod, now, frame }: { mod: DashboardModule; now: { current: Now }; frame: boolean }) {
  const { state } = now.current;
  const links = widgetLinks(state, mod.id);
  const views = viewPlans(mod);
  const layouts = layoutPlans(mod);
  const files = widgetFiles(mod.id);
  const notes = Object.entries(useWidgetNotes(mod.id) ?? {});
  const frameNotes = notes.filter(([key]) => key !== "*");
  const data = mod.readsAll ? "every sensor" : [...mod.prefixes, ...(mod.reads ?? [])].join(", ") || "none";
  const facts: [string, ReactNode][] = [
    ["Category", mod.category ?? "Generic"],
    ["Minimum", `${mod.minCols ?? 1}x${mod.minRows ?? 1}`],
    ...(mod.defaultSize ? [["Default", `${mod.defaultSize[0]}x${mod.defaultSize[1]}`] as [string, ReactNode]] : []),
    ["Data", <span key="data" className="font-ui-mono text-micro">{data}</span>],
    ...(views.length ? [["Views", <FrameLinks key="views" module={mod.id} items={views} prefix="view" />] as [string, ReactNode]] : []),
    ...(layouts.length ? [["Layouts", <FrameLinks key="layouts" module={mod.id} items={layouts} prefix="layout" />] as [string, ReactNode]] : []),
    ...(mod.tags ? [["Tags", <span key="tags" className="font-ui-mono text-micro">{mod.tags}</span>] as [string, ReactNode]] : []),
  ];
  return (
    <div className="space-y-3">
      <div>
        <p className="text-micro font-semibold uppercase tracking-wider text-ui-3">Widget</p>
        <h2 className="text-body font-semibold text-ui-1">{mod.title}</h2>
        <p className="font-ui-mono text-micro text-ui-3">{mod.id}</p>
      </div>
      {!frame && (
        <div className="flex flex-wrap gap-1.5">
          <ClaudeButton text={() => claudeText(now, mod.id, true)} title="Copy this widget's mounted frames, with what they found, as text for Claude" className={ACTION} />
          <ClaudeButton text={async () => `${window.location.href.split("#")[0]}#${mod.id}`} title="Copy a link to this widget's section" className={ACTION} label="Copy link" />
          <a href={links.solo} className={ACTION}>
            Open solo
          </a>
          <a href={links.skins} className={ACTION}>
            Open in galleries
          </a>
        </div>
      )}
      <Facts rows={facts} />
      {(mod.blurb || mod.description) && (
        <div className="space-y-1 text-caption">
          {mod.blurb && <p className="text-ui-1">{mod.blurb}</p>}
          {mod.description && <p className="text-ui-2">{mod.description}</p>}
        </div>
      )}
      <Block title="Notes" count={notes.length}>
        <NoteEditor key={mod.id} module={mod.id} frameKey="*" name="the widget" />
        {frameNotes.length > 0 && (
          <ul className="space-y-1 text-caption">
            {frameNotes.map(([key, n]) => {
              const fixed = noteStatus(n) === "fixed";
              return (
                <li key={key} className={fixed ? "text-ui-3" : "text-ui-warn-text"}>
                  <button type="button" title={`Select the ${key} frame and edit its note`} onClick={() => {
                      select(frameId(mod.id, key));
                      document.getElementById(frameId(mod.id, key))?.scrollIntoView({ block: "nearest" });
                    }} className="rounded-ui-sm font-ui-mono text-micro text-ui-3 underline decoration-current/30 underline-offset-2 hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-ui-accent">
                    {key}
                  </button>{" "}
                  {fixed && <span className="text-micro">fixed · </span>}
                  {noteText(n)}
                </li>
              );
            })}
          </ul>
        )}
      </Block>
      <Block title="Files">
        {files ? (
          <ul className="space-y-0.5">
            <li>
              <Copyable text={files.folder} />
            </li>
            {files.files.map((f) => (
              <li key={f} className="pl-2">
                <Copyable text={`${files.folder}${f}`} />
              </li>
            ))}
          </ul>
        ) : (
          <Quiet>No widget folder: a legacy widget (src/modules).</Quiet>
        )}
      </Block>
      {mod.settings && mod.settings.length > 0 && (
        <Block title="Settings" count={mod.settings.filter((d) => !d.hidden).length}>
          <SettingsList mod={mod} />
        </Block>
      )}
    </div>
  );
}
