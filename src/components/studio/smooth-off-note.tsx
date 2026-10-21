import type { SmoothOffScreen } from "./screens-model";

interface SmoothOffNoteProps {
  /** The screens whose cap or animations turn Smooth off (`smoothOffScreens`), narrowed to the scope being edited. */
  screens: readonly SmoothOffScreen[];
  /** Screens at that screen, on its performance. */
  onOpenScreen: (profileId: string) => void;
}

/**
 * Motion's warning (PLAN decision 25): Smooth glides graphs between readings, but below 60 fps or with reduced
 * animations the studio drops its transitions, so those screens step at the data rate whatever is chosen here.
 */
export function SmoothOffNote({ screens, onOpenScreen }: SmoothOffNoteProps) {
  if (screens.length === 0) return null;
  return (
    <div role="note" className="mb-1 rounded-md border border-ui-default bg-ui-raised px-2.5 py-2 text-[11.5px] leading-[1.45] text-ui-3">
      Smooth is off on:
      <ul className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0">
        {screens.map((screen) => (
          <li key={screen.id}>
            {screen.name} ({screen.reason}){" "}
            <button
              type="button"
              onClick={() => onOpenScreen(screen.id)}
              className="rounded-sm text-ui-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
            >
              Screens ↗
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
