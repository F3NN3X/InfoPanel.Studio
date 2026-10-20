import { createContext, useContext, type ReactNode } from "react";

const PreviewContext = createContext(false);

/**
 * Marks everything below as a thumbnail (a profile preview): widgets that animate, fetch or load
 * fonts draw a still, network-free stand-in instead.
 */
export function PreviewProvider({ children }: { children: ReactNode }) {
  return <PreviewContext.Provider value>{children}</PreviewContext.Provider>;
}

/** Whether this is drawn as a thumbnail. */
export const usePreview = (): boolean => useContext(PreviewContext);
