import { ChevronRight, MoreHorizontal } from "lucide-react";
import { Menu } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import { CONTROL_HELP, tipOf, type ControlId } from "./help-text";
import { GALLERY_IDS, PAGE_THEMES } from "./options";
import type { QaState } from "./params";

interface PageMenuProps {
  state: QaState;
  onChange: (patch: Partial<QaState>) => void;
  onReset: () => void;
  onCopyLink: () => void;
  onMountAll: () => void;
  onHelp: () => void;
}

// a glyph, not lucide's Check: importing that icon here splits it into a chunk of its own, which every studio and kiosk chunk
// that draws it then imports (perf:budgets)
const tick = (on: boolean) => (
  <span aria-hidden className={`w-3.5 shrink-0 text-center text-caption ${on ? "" : "invisible"}`}>
    ✓
  </span>
);

/** A menu row named and explained as its control is (`help-text.ts`): the explanation is its hover text. */
function Action({ id, onClick }: { id: ControlId; onClick: () => void }) {
  return (
    <Menu.Item title={tipOf(id)} onClick={onClick}>
      {CONTROL_HELP[id].name}
    </Menu.Item>
  );
}

/** A flyout of choices with the chosen one ticked; `blank` is the row for "unset". */
function Choices({ id, value, options, blank, onPick }: { id: ControlId; value: string; options: readonly string[]; blank: string; onPick: (v: string) => void }) {
  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger title={tipOf(id)}>
        <span>{CONTROL_HELP[id].name}</span>
        <span className="flex items-center gap-1 text-micro text-ui-3">
          {value || blank}
          <ChevronRight aria-hidden className="h-3 w-3" />
        </span>
      </Menu.SubmenuTrigger>
      <Menu.Content alignOffset={-4} className="max-h-[min(24rem,var(--available-height))] overflow-y-auto" data-qa-ui="">
        {["", ...options].map((o) => (
          <Menu.Item key={o || "-"} onClick={() => onPick(o)} className="justify-start">
            {tick(o === value)}
            {o || blank}
          </Menu.Item>
        ))}
      </Menu.Content>
    </Menu.SubmenuRoot>
  );
}

/** The ⋯ menu: the page's background, the galleries, the app surfaces and the page-wide actions, then Help. */
export function PageMenu({ state, onChange, onReset, onCopyLink, onMountAll, onHelp }: PageMenuProps) {
  return (
    <Menu.Root>
      <Tooltip label="More: page background, galleries, surfaces, reset, help" side="bottom">
        <Menu.Trigger aria-label="More" className="inline-flex h-7 w-7 items-center justify-center rounded-ui-md text-ui-2 hover:bg-ui-hover hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent data-popup-open:bg-ui-active">
          <MoreHorizontal aria-hidden className="h-4 w-4" />
        </Menu.Trigger>
      </Tooltip>
      <Menu.Content align="end" className="min-w-60" data-qa-ui="">
        <Choices id="theme" value={state.theme} options={PAGE_THEMES} blank="Dark" onPick={(theme) => onChange({ theme })} />
        <Choices
          id="gallery"
          value={state.gallery}
          options={GALLERY_IDS}
          blank="Default"
          onPick={(gallery) => {
            onChange({ gallery });
            requestAnimationFrame(() => document.getElementById("galleries")?.scrollIntoView());
          }}
        />
        <Menu.Item title={tipOf("surfaces")} onClick={() => onChange({ surfaces: !state.surfaces })}>
          {CONTROL_HELP.surfaces.name}
          {tick(state.surfaces)}
        </Menu.Item>
        <Menu.Separator />
        <Action id="mountAll" onClick={onMountAll} />
        <Action id="copyLink" onClick={onCopyLink} />
        <Action id="reset" onClick={onReset} />
        <Menu.Separator />
        <Action id="help" onClick={onHelp} />
      </Menu.Content>
    </Menu.Root>
  );
}
