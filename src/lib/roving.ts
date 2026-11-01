import type { KeyboardEvent } from "react";

/** Where an arrow key goes in a row of `count` items (wraps); `null` = not a roving key. */
export function rovingTarget(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/**
 * Roving tabindex for a radiogroup or tablist (WAI-ARIA APG): put it on the container's onKeyDown, give the chosen
 * item `tabIndex 0` and the rest `-1`. Arrows, Home and End move focus to the next enabled item matching `selector`
 * and, as selection follows focus, click it (`select: false` only moves focus).
 */
export function onRovingKeyDown(e: KeyboardEvent<HTMLElement>, selector: string, select = true): void {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>(selector)].filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-disabled") !== "true"
  );
  const at = items.indexOf(e.target as HTMLElement);
  if (at < 0) return;
  const to = rovingTarget(e.key, at, items.length);
  if (to === null) return;
  e.preventDefault();
  items[to].focus();
  if (select) items[to].click();
}
