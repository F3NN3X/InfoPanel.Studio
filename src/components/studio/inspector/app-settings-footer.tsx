import { openSettings } from "@/lib/desktop";

/** The desktop app's way from the profile inspector to the Settings window (what the rail's Settings button opens). */
export function AppSettingsFooter() {
  return (
    <footer className="flex h-10 shrink-0 items-center border-t border-ui-subtle px-4">
      <button
        type="button"
        onClick={() => void openSettings().catch(() => {})}
        className="truncate text-left text-[11.5px] text-ui-3 hover:text-ui-1 hover:underline"
      >
        Server, updates and startup are in App settings ↗
      </button>
    </footer>
  );
}
