/** The class strings the studio's small menus and icon buttons share. */
/** A visible keyboard focus for a card or tab whose border already means "selected" (a border change alone reads as selected). */
export const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";
export const ICON_BUTTON =
  "flex h-6 w-6 items-center justify-center rounded-md border border-ui-strong text-ui-3 transition-colors hover:bg-ui-hover hover:text-ui-1 disabled:pointer-events-none disabled:opacity-40 data-popup-open:bg-ui-hover data-popup-open:text-ui-1";
export const POPUP =
  "min-w-40 rounded-[9px] border border-ui-menu bg-ui-raised p-1 font-ui text-[12.5px] text-ui-2 shadow-ui-menu outline-none";
/** The keyboard-highlighted row of a Base UI menu: a clear step and an inset accent edge (1.03:1 fill alone is invisible). */
export const HIGHLIGHT =
  "data-highlighted:bg-ui-active data-highlighted:text-ui-1 data-highlighted:shadow-[inset_2px_0_0_var(--ui-accent)]";
export const ITEM =
  `flex h-[30px] cursor-default items-center justify-between gap-3 rounded-md px-2 outline-none select-none data-disabled:text-ui-hint ${HIGHLIGHT} data-popup-open:bg-ui-hover`;
export const SEPARATOR = "mx-1 my-1 h-px bg-ui-subtle";
