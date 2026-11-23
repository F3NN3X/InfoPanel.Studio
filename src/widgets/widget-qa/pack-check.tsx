import { useEffect, useMemo, useRef, useState } from "react";
import { TEMPLATE_MODULES } from "@/widgets/registry";
import { maskFiles, measurePack, readMaskImages, renderRefusals } from "@/looks/pack-render-measures";
import type { PackSource } from "@/looks/pack-validate";
import { wearCandidate } from "@/looks/user-packs";
import { mountAllSettled } from "./Frame";
import { WidgetSection, type View } from "./Section";

/** The caps the specs hold the built-in packs to. */
const MEASURE = { alphaMax: 0.4, minOpacity: 0.5 };
// 1x1 and 4x4 draw slots the middle tiers do not (compact and roomy layouts), and the QA page measures the same four
const SPANS: [number, number][] = [[1, 1], [2, 2], [4, 2], [4, 4]];
const refuse = (refusals: string[]) => window.parent.postMessage({ kind: "pack-check-done", refusals }, window.location.origin);

/**
 * The Widget QA page as the studio's render check opens it (`pack-render-check`): only inside a frame of this origin, with no
 * toolbar and none of the page's `window.__qa*` tools, every template widget wearing the candidate the studio sends. Opened
 * any other way it draws nothing, and the server does not open it for a page of its own.
 */
export default function PackCheck() {
  const [worn, setWorn] = useState<{ id: string; style: Record<string, string>; files: Record<string, Blob> }>();
  const started = useRef(false);
  useEffect(() => {
    if (window.parent === window) return;
    const heard = (e: MessageEvent) => {
      if (e.source !== window.parent || e.origin !== window.location.origin || e.data?.kind !== "pack-check-run" || started.current) return;
      started.current = true;
      const src = e.data.src as PackSource;
      const candidate = wearCandidate(src);
      // the candidate is not stored, so its url() masks are read from the files sent with it
      if (candidate) setWorn({ ...candidate, files: maskFiles(candidate.id, src.files, window.location.origin) });
      else refuse(["the pack could not be worn"]);
    };
    window.addEventListener("message", heard);
    window.parent.postMessage({ kind: "pack-check-ready" }, window.location.origin);
    return () => window.removeEventListener("message", heard);
  }, []);
  useEffect(() => {
    if (!worn) return;
    void (async () => {
      try {
        // a page still changing would be measured half-built: it gets a second wait, then the pack is refused
        if (!(await mountAllSettled()) && !(await mountAllSettled())) return refuse(["the widgets did not settle, so nothing could be measured"]);
        if (!document.querySelector(`style[data-pack="${worn.id}"]`)) return refuse(["the pack's stylesheet was not mounted"]);
        const maskImages = await readMaskImages({ look: worn.id, files: worn.files });
        refuse(renderRefusals(measurePack({ look: worn.id, ...MEASURE, maskImages })));
      } catch (e) {
        refuse([`the render check failed: ${(e as Error).message}`]);
      }
    })();
  }, [worn]);
  const view = useMemo((): View | undefined => {
    if (!worn) return undefined;
    const none = { text: "", url: "" };
    return { spans: SPANS, cell: 110, gap: 8, live: false, eager: true, settings: worn.style, grid: false, links: () => ({ solo: "", skins: "" }), frameRef: () => none };
  }, [worn]);
  return <main className="bg-ui-app">{view && TEMPLATE_MODULES.map((m) => <WidgetSection key={m.id} mod={m} view={view} />)}</main>;
}
