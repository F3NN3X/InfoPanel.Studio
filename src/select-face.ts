/**
 * The closed box of a customizable select (src/select.css) draws its value in a `<selectedcontent>` inside a leading
 * `<button>`; without one the engine paints the text itself, where no CSS can cut it with an ellipsis. Every select gets
 * that button once, when it appears, so a long value shrinks to its box instead of spilling out of it. An engine without
 * base-select is left alone.
 */
function addFace(select: HTMLSelectElement): void {
  if (select.querySelector(":scope > button")) return;
  const button = document.createElement("button");
  button.append(document.createElement("selectedcontent"));
  select.prepend(button);
}

function faceAll(node: Node): void {
  if (!(node instanceof Element)) return;
  if (node instanceof HTMLSelectElement) addFace(node);
  for (const select of node.querySelectorAll("select")) addFace(select);
}

export function installSelectFace(): void {
  if (typeof CSS === "undefined" || !CSS.supports("appearance", "base-select")) return;
  faceAll(document.documentElement);
  new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) faceAll(node);
  }).observe(document.documentElement, { childList: true, subtree: true });
}
