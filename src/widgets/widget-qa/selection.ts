type Selection = { frame: string | null };
let state: Selection = { frame: null };
const subs = new Set<() => void>();
export const getSelection = () => state;
export const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };
export const select = (frame: string | null) => { state = { frame }; for (const f of subs) f(); };
/** The selection that opens the notes queue in the inspector (the widget list's Notes queue entry). */
export const NOTES_QUEUE = "notes:queue";
