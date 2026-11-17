/** The class strings the studio's small menus and icon buttons share. */
/** A visible keyboard focus for a card or tab whose border already means "selected" (a border change alone reads as selected). */
export const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";
export const ICON_BUTTON =
  "flex h-6 w-6 items-center justify-center rounded-md border border-ui-strong text-ui-3 transition-colors hover:bg-ui-hover hover:text-ui-1 disabled:pointer-events-none disabled:opacity-40 data-popup-open:bg-ui-hover data-popup-open:text-ui-1";
export const POPUP =
  "min-w-40 rounded-ui-menu border border-ui-menu bg-ui-raised p-1 font-ui text-body text-ui-2 shadow-ui-menu outline-none";
/** The keyboard-highlighted row of a Base UI menu: the bg-highlight fill (3.1:1 on the popup; bg-active alone is invisible), no edge. */
export const HIGHLIGHT =
  "data-highlighted:bg-ui-highlight data-highlighted:text-ui-1";
export const ITEM =
  `group flex h-8 cursor-default items-center justify-between gap-3 rounded-ui-md px-2 outline-none select-none data-disabled:text-ui-hint ${HIGHLIGHT} data-popup-open:bg-ui-hover`;
export const SEPARATOR = "mx-1 my-1 h-px bg-ui-subtle";
