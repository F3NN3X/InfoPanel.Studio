// A chord is keys joined by "+": Ctrl+Shift+G, Ctrl+=, Alt+ArrowUp.
const CHORD = /^[^\s+]+(\+[^\s+]+)*$/;
// A sequence is separate keys: "Ctrl +", "Ctrl 0", "← ↑ → ↓". Prose such as "Drag a tab" is not one.
const KEY_WORD = /^(?:\S|[A-Z][A-Za-z]{0,8})$/;

/**
 * The key caps of a combo, one list per alternative: "Ctrl+Shift+Z / Ctrl+Y" is two (the keys of
 * each); a chord splits on "+", a short sequence on spaces, and anything else stays one cap.
 */
export function comboParts(combo: string): string[][] {
  return combo.split(" / ").map((alt) => {
    const text = alt.trim();
    if (CHORD.test(text)) return text.split("+");
    const words = text.split(/\s+/);
    return words.length > 1 && words.every((w) => KEY_WORD.test(w)) ? words : [text];
  });
}
