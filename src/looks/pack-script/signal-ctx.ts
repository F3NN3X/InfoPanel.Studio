// Whether a card wears a pack with a script: only then do its bars and rings write the value a script may read
// (`data-fx-value`, `data-fx-state`, primitives.tsx), so every other card renders exactly as before. In the entries, so it stays this small.
import { createContext } from "react";

export const ScriptSignalsCtx = createContext(false);
