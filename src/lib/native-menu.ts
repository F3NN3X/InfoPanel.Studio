/**
 * The desktop app shows only its own right-click menus: the webview's native one (Back, Reload,
 * Inspect…) is cancelled everywhere except in text fields, where it keeps cut / copy / paste.
 * The listener bubbles, so a component's own menu handles the event first.
 */

const TEXT_INPUTS = new Set(["", "text", "search", "url", "email", "password", "tel", "number"]);

/** A field the native menu still serves (cut, copy, paste, spelling). */
export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return TEXT_INPUTS.has(target.getAttribute("type")?.toLowerCase() ?? "");
  return target instanceof HTMLElement && target.isContentEditable;
}

/** Cancel the native menu outside text fields; returns the remover. */
export function suppressNativeMenu(target: Window | Document = window): () => void {
  const onMenu = (e: Event) => {
    if (!isTextField(e.target)) e.preventDefault();
  };
  target.addEventListener("contextmenu", onMenu);
  return () => target.removeEventListener("contextmenu", onMenu);
}
