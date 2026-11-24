import { useState } from "react";
import { createPortal } from "react-dom";
import type { Flag } from "../adoption";
import { frameLink, frameName, type FrameKind } from "../claude";
import { ClaudeButton } from "../ClaudeButton";
import { claudeText, type Now } from "../console";
import { notesFor } from "../notes";
import { frameRef, widgetLinks } from "../params";
import type { Issue, Probed } from "../probe";
import { ACTION, Block, Quiet } from "./parts";
import { useRead } from "./reads";

/** A frame on the page as the inspector shows it: its figure (or surface), its anchor or surface key, and what it is. */
export interface InspectedFrame {
  el: Element;
  /** The selection's value: the figure's anchor (`CpuMonitor--2x1`), a surface's `surface:<name>`. */
  id: string;
  module: string;
  key: string;
  kind: FrameKind;
}

/** The probe's kinds as the UI names them; the raw kind stays in Copy for Claude and the report. */
const KIND: Record<Issue["kind"], string> = { exceeds: "Pokes out", overlaps: "Overlaps", clipped: "Cut off" };
const amount = (x: Issue) => (x.kind === "overlaps" ? `${x.dx} px²` : `dx ${x.dx} dy ${x.dy}`);

/**
 * Outlines an issue's element (an overlap: both) inside its frame. The outline goes in the box's wrapper, outside `[data-qa-box]`, as
 * the grid overlay does, so the probe, the theme check and `--frames-only` shots never see it.
 */
function Highlight({ box, probed }: { box: Element; probed: Probed }) {
  const wrap = box.parentElement;
  if (!wrap) return null;
  const at = wrap.getBoundingClientRect();
  const els = [probed.el, ...(probed.other ? [probed.other] : [])].filter((el) => el.isConnected);
  return createPortal(
    els.map((el, i) => {
      const r = el.getBoundingClientRect();
      return <div key={i} data-qa-ui="" data-qa-highlight="" aria-hidden className="pointer-events-none absolute z-30 bg-red-500/20 outline outline-2 outline-red-500/70" style={{ left: r.left - at.left, top: r.top - at.top, width: r.width, height: r.height }} />;
    }),
    wrap
  );
}

function IssueRows({ box, probed }: { box: Element | null; probed: Probed[] }) {
  const [hover, setHover] = useState(-1);
  return (
    <ul className="space-y-1">
      {probed.map((p, i) => (
        <li key={i}>
          <button
            type="button"
            title="Hover to outline it in the frame; click to scroll the frame into view"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(-1)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(-1)}
            onClick={() => box?.scrollIntoView({ block: "nearest" })}
            className="w-full rounded-ui-sm px-1.5 py-1 text-left hover:bg-ui-hover focus-visible:outline-2 focus-visible:outline-ui-accent"
          >
            <span className="flex items-baseline justify-between gap-2 text-caption">
              <span className="text-ui-danger-text">{KIND[p.issue.kind]}</span>
              <span className="font-ui-mono text-micro text-ui-3">{amount(p.issue)}</span>
            </span>
            <code className="block break-all font-ui-mono text-micro text-ui-2">{p.issue.selector}</code>
          </button>
        </li>
      ))}
      {box && hover >= 0 && probed[hover] && <Highlight box={box} probed={probed[hover]} />}
    </ul>
  );
}

function FlagRows({ flags }: { flags: Flag[] }) {
  return (
    <ul className="space-y-1">
      {flags.map((f, i) => (
        <li key={i} className="px-1.5 py-1">
          <span className="flex items-baseline justify-between gap-2 text-caption">
            <span className="text-ui-warn-text">{f.kind}</span>
            <span className="font-ui-mono text-micro text-ui-3">{f.prop}</span>
          </span>
          <span className="flex items-center gap-1.5 font-ui-mono text-micro text-ui-2">
            {f.kind === "colour" && <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm border border-ui-strong" style={{ background: f.value }} />}
            <span className="break-all">{f.value}</span>
          </span>
          <span className="block break-all font-ui-mono text-micro text-ui-3">at {f.at}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The selected frame: its issues (hover one to outline its element in the frame), its theme flags, its note and its actions: Copy for
 * Claude, Copy reference (what the caption copied before), Copy link, Open solo and Open in galleries. A surface has no widget, so it
 * has neither the probe (the page does not probe surfaces) nor the widget's links.
 */
export function FramePart({ frame, now }: { frame: InspectedFrame; now: { current: Now } }) {
  const read = useRead(frame.id);
  const { state, adoption } = now.current;
  const base = `${window.location.origin}${window.location.pathname}`;
  const box = frame.el.querySelector("[data-qa-box]");
  const r = box?.getBoundingClientRect();
  const surface = frame.kind === "surface";
  const note = frame.module ? notesFor(frame.module)?.[frame.key] : undefined;
  const links = frame.module ? widgetLinks(state, frame.module) : undefined;
  const notRead = "Not checked yet: a frame checks itself 1.5 s after it mounts (it mounts as it scrolls into view).";
  return (
    <div className="space-y-3">
      <div>
        <p className="text-micro font-semibold uppercase tracking-wider text-ui-3">{surface ? "Surface" : "Frame"}</p>
        <h2 className="font-ui-mono text-body text-ui-1">{frameName(frame.module, frame.key)}</h2>
        {r && <p className="font-ui-mono text-micro text-ui-3">{`${Math.round(r.width)}×${Math.round(r.height)} px`}</p>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <ClaudeButton text={() => claudeText(now, frame.id, true)} title="Copy this frame, with what it found, as text for Claude" className={ACTION} />
        {!surface && <ClaudeButton text={async () => frameRef(state, frame.module, frame.key, base).text} title="Copy a reference to this frame (what its caption copied before)" className={ACTION} label="Copy reference" />}
        <ClaudeButton text={async () => frameLink(frame, { state, base })} title="Copy a link that opens this frame" className={ACTION} label="Copy link" />
        {links && (
          <>
            <a href={links.solo} className={ACTION}>
              Open solo
            </a>
            <a href={links.skins} className={ACTION}>
              Open in galleries
            </a>
          </>
        )}
      </div>
      {!surface && (
        <Block title="Issues" count={read?.probed.length}>
          {!read ? <Quiet>{notRead}</Quiet> : read.probed.length ? <IssueRows box={box} probed={read.probed} /> : <Quiet>None: nothing pokes out, overlaps or is cut off.</Quiet>}
        </Block>
      )}
      <Block title="Theme flags" count={adoption ? read?.flags.length : undefined}>
        {!adoption ? <Quiet>Not checked: the theme check runs while a Look other than Classic is worn (Look in the top bar).</Quiet> : !read ? <Quiet>{notRead}</Quiet> : read.flags.length ? <FlagRows flags={read.flags} /> : <Quiet>None: everything it draws is the Look's.</Quiet>}
      </Block>
      {!surface && <Block title="Note">{note ? <p className="text-caption text-ui-warn-text">{note}</p> : <Quiet>No note for this frame (notes.json).</Quiet>}</Block>}
    </div>
  );
}
