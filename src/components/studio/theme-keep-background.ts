/** "Keep my background", remembered for the session (owner decision 6): not stored, off when the studio opens. */
let keepBackgroundPref = false;

export const getKeepBackground = (): boolean => keepBackgroundPref;

export function setKeepBackground(keep: boolean): void {
  keepBackgroundPref = keep;
}
