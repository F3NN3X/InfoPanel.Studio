import type { ReactNode } from "react";
import { FOCUS_RING } from "@/components/ui/button";
import { CardMenu, useCardContextMenu, type CardAction } from "./card-actions";
import { previewBox } from "./profile-card";

interface ScreenRowProps {
  name: string;
  /** Replaces the name while it is being renamed. */
  nameField?: ReactNode;
  badges?: ReactNode;
  /** The size line (`1600 × 900 · 1 page · 7 widgets`). */
  meta: string;
  aspect: number;
  thumb: ReactNode;
  /** "On 2 displays". */
  chip?: ReactNode;
  onClick: () => void;
  /** The thumbnail button's name: "Open Desk". */
  label: string;
  actions: readonly CardAction[];
  /** The screen's pages as mini-maps that open Edit on one (`PageStrip` inline); absent for a screen of one page. */
  pages?: ReactNode;
}

/** One screen as a row of the list layout: the same name, size, chip and actions as its card, on one line. */
export function ScreenRow({ name, nameField, badges, meta, aspect, thumb, chip, onClick, label, actions, pages }: ScreenRowProps) {
  const context = useCardContextMenu(actions);
  return (
    <li
      onClick={onClick}
      onContextMenu={context.onContextMenu}
      className="group flex min-w-0 cursor-pointer items-center gap-3 max-md:flex-wrap rounded-ui-lg border border-ui-default bg-ui-panel p-2 transition-colors duration-(--ui-dur-fast) ease-ui hover:border-ui-hover-edge"
    >
      <button type="button" aria-label={label} className={`grid h-[52px] w-[92px] shrink-0 place-items-center rounded-ui-sm bg-ui-chrome ${FOCUS_RING}`}>
        <div className="overflow-hidden rounded-[3px] border border-ui-strong bg-s-well" style={{ ...previewBox(aspect), width: `min(100%, ${Math.round(44 * aspect)}px)` }}>
          {thumb}
        </div>
      </button>
      <div className="min-w-0 flex-1 text-body font-medium text-ui-1">{nameField ?? <span className="block truncate">{name}</span>}</div>
      {pages && <div className="max-lg:hidden">{pages}</div>}
      {/* On a phone the badges and the chip drop to a second line under the name, so the Default marker stays. */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 max-md:order-last max-md:basis-full">{badges}</div>
      <span className="hidden shrink-0 font-ui-mono text-micro text-ui-3 sm:block">{meta}</span>
      <div className="flex min-w-[110px] shrink-0 justify-end max-md:order-last max-md:min-w-0 empty:max-md:hidden">{chip}</div>
      <div onClick={(e) => e.stopPropagation()}>
        <CardMenu actions={actions} label="Screen actions" />
      </div>
      {context.menu}
    </li>
  );
}
