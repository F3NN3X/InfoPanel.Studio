import { useEffect, useMemo, useRef, useState } from "react";
import { postThemePreview } from "@/lib/control";
import type { DashboardConfig } from "@/lib/layout";
import { applyPreview, type ThemePreview } from "@/lib/theme-preview";
import type { ThemeAt } from "./theme-cards";
import {
  choiceOf,
  KIOSK_PREVIEW_MS,
  kioskPreview,
  PREVIEW_COMPARE_KEY,
  PREVIEW_HOVER_KEY,
  PREVIEW_KIOSKS_KEY,
  scopeOf,
  stepPreview,
  type PreviewItem,
  type ScopeChoice,
} from "./theme-live-preview-model";
import { useStoredFlag } from "./use-stored-flag";

/** A hovered card previews after this long, so a pointer passing over the grid draws nothing. */
const HOVER_MS = 150;

/** Keys inside these keep their own meaning (typing, a menu, a group's arrows, the card grid's roving focus). */
const OWN_KEYS = "input, textarea, select, [contenteditable='true'], [role=dialog], [role=menu], [role=listbox], [role=radiogroup], [role=tablist], [role=slider], [data-look-card]";
/** Esc in these closes them or clears a field, not the preview. */
const OWN_ESCAPE = "input, textarea, select, [contenteditable='true'], [role=dialog], [role=menu], [role=listbox]";
/** Enter on these is their own click. */
const OWN_ENTER = "button, a[href], [role=button], [role=switch], [role=checkbox], [role=menuitem]";

interface Args {
  config: DashboardConfig;
  at: ThemeAt;
  keepBackground: boolean;
  /** Every card, in Browse's order (`previewOrder`). */
  order: readonly PreviewItem[];
  /** Apply the preview: one change, as Switch theme (the editor writes it and says so in its toast). */
  onApply: (item: PreviewItem, preview: ThemePreview) => void;
}

export interface LivePreview {
  /** The card shown: the one hovered (Preview on hover), else the one picked. */
  shown?: PreviewItem;
  /** The config as Apply would leave it, while a card is shown. */
  config?: DashboardConfig;
  choice: ScopeChoice;
  setChoice: (choice: ScopeChoice) => void;
  preview: (item: PreviewItem) => void;
  hover: (item: PreviewItem | undefined) => void;
  step: (delta: 1 | -1) => void;
  apply: () => void;
  cancel: () => void;
  /** Browse's cards as its filters leave them: Next and Previous step through these. */
  setVisible: (ids: readonly string[]) => void;
  onHover: boolean;
  setOnHover: (on: boolean) => void;
  compare: boolean;
  setCompare: (on: boolean) => void;
  kiosks: boolean;
  setKiosks: (on: boolean) => void;
  /** When the kiosks go back to the saved theme (epoch ms), while they show the preview. */
  kioskUntil?: number;
  /** Show it on the kiosks again after the time ran out. */
  kioskAgain: () => void;
}

/**
 * Theme's live preview: a card picked (or hovered) is drawn on the canvas, at a scope, without touching the config.
 * Apply writes it in one change; Cancel, Esc, leaving the view or moving to another screen drop it. With "Show on the
 * kiosks too" the server shows it on the kiosks for KIOSK_PREVIEW_MS, and drops it itself if this studio goes away.
 */
export function useThemeLivePreview({ config, at, keepBackground, order, onApply }: Args): LivePreview {
  const [picked, setPicked] = useState<PreviewItem>();
  const [hovered, setHovered] = useState<PreviewItem>();
  const [choice, setChoice] = useState<ScopeChoice>(() => choiceOf(at));
  const [onHover, setOnHover] = useStoredFlag(PREVIEW_HOVER_KEY, false);
  const [compare, setCompare] = useStoredFlag(PREVIEW_COMPARE_KEY, false);
  const [kiosks, setKiosks] = useStoredFlag(PREVIEW_KIOSKS_KEY, false);
  const [kioskUntil, setKioskUntil] = useState<number>();
  const [kioskRound, setKioskRound] = useState(0);
  const visible = useRef<readonly string[]>(undefined);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The level moves with the view's scope bar (All screens stays); another screen ends the preview.
  useEffect(() => setChoice((c) => (c === "all" ? c : choiceOf(at))), [at.level]);
  useEffect(() => {
    setPicked(undefined);
    setHovered(undefined);
  }, [at.profileId]);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  const shown = hovered ?? picked;
  const scope = scopeOf(choice, at);
  const scopeKey = JSON.stringify(scope);
  const previewOf = (item: PreviewItem): ThemePreview => ({ preset: item.preset, look: item.look, scope, keepBackground });
  const previewed = useMemo(
    () => (shown ? applyPreview(config, { preset: shown.preset, look: shown.look, scope, keepBackground }) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, config, scopeKey, keepBackground]
  );

  const cancel = () => {
    clearTimeout(hoverTimer.current);
    setPicked(undefined);
    setHovered(undefined);
  };
  const apply = () => {
    if (!shown) return;
    onApply(shown, previewOf(shown));
    cancel();
  };
  const step = (delta: 1 | -1) => {
    const next = stepPreview(order, visible.current, picked?.id, delta);
    if (next) {
      setHovered(undefined);
      setPicked(next);
    }
  };

  // The kiosks: the picked card (never a hover), sent again when it or its scope changes, taken back when it goes. The
  // posts go one after another, so the server never takes an older one last.
  const kioskBody = picked && kiosks ? JSON.stringify(kioskPreview(previewOf(picked))) : undefined;
  const posts = useRef<Promise<unknown>>(Promise.resolve());
  const sent = useRef(false);
  const post = (body: object | null) => {
    const next = posts.current.then(() => postThemePreview(body));
    posts.current = next;
    return next;
  };
  useEffect(() => {
    if (!kioskBody) {
      setKioskUntil(undefined);
      if (sent.current) void post(null);
      sent.current = false;
      return;
    }
    sent.current = true;
    let live = true;
    void post(JSON.parse(kioskBody) as object).then((ok) => live && setKioskUntil(ok ? Date.now() + KIOSK_PREVIEW_MS : undefined));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kioskBody, kioskRound]);
  // Leaving the view takes it back.
  useEffect(
    () => () => {
      if (sent.current) void post(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  // The countdown ran out: the server has dropped it.
  useEffect(() => {
    if (kioskUntil === undefined) return;
    const t = setTimeout(() => setKioskUntil(undefined), Math.max(0, kioskUntil - Date.now()));
    return () => clearTimeout(t);
  }, [kioskUntil]);

  // Esc cancels, Enter applies, the arrows step: wherever those keys have no meaning of their own. Taken in the capture
  // phase, before the studio's shortcuts (whose Esc would otherwise clear the selection and stop here).
  const keys = useRef({ cancel, apply, step });
  keys.current = { cancel, apply, step };
  const active = shown !== undefined;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (e.key === "Escape") {
        if (target?.closest(OWN_ESCAPE)) return;
        e.preventDefault();
        keys.current.cancel();
        return;
      }
      if (target?.closest(OWN_KEYS)) return;
      if (e.key === "Enter" && !target?.closest(OWN_ENTER)) {
        e.preventDefault();
        keys.current.apply();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        keys.current.step(e.key === "ArrowRight" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active]);

  return {
    shown,
    config: previewed,
    choice,
    setChoice,
    preview: (item) => {
      clearTimeout(hoverTimer.current);
      setHovered(undefined);
      setPicked(item);
    },
    hover: (item) => {
      clearTimeout(hoverTimer.current);
      if (!item) return setHovered(undefined);
      if (onHover) hoverTimer.current = setTimeout(() => setHovered(item), HOVER_MS);
    },
    step,
    apply,
    cancel,
    setVisible: (ids) => void (visible.current = ids),
    onHover,
    setOnHover,
    compare,
    setCompare,
    kiosks,
    setKiosks,
    kioskUntil,
    kioskAgain: () => setKioskRound((n) => n + 1),
  };
}
