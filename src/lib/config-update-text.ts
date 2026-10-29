import { CONFIG_VERSION } from "./layout";

/** Where the update stands: asking, saving, done (with the backup's path, when the server named one), or failed. */
export type ConfigUpdate =
  | { state: "ask" | "saving"; from: number }
  | { state: "done"; from: number; backup?: string }
  | { state: "failed"; from: number; error: string };

/** The dialog's words for each state. */
export function updateText(u: ConfigUpdate): { title: string; body: string } {
  switch (u.state) {
    case "ask":
    case "saving":
      return {
        title: "Your screens need an update",
        body: `This version of InfoPanel Studio saves screens in a newer format. Your configuration (format ${u.from}) will be updated to format ${CONFIG_VERSION}. A backup of your screens is saved first.`,
      };
    case "done":
      return {
        title: "Your screens are updated",
        body: u.backup ? `The backup of your screens is at ${u.backup}.` : "Your screens are saved in the new format.",
      };
    case "failed":
      return { title: "The update didn't finish", body: `Your screens were not changed. ${u.error}` };
  }
}
