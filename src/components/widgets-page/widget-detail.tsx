// The Widgets page's detail pane (Phase 5b, screenshots 01-03): the preview, the name and what it is, who stands behind it (the
// trust box), Add to a screen, Edit or About, Export and the menu, then its presets, the options people can change and the screens
// it is on. A built-in shows the same, with "Duplicate as a recipe" (or why it can't be one).
import type { CSSProperties, ReactNode } from "react";
import { Menu } from "@/components/ui/menu";
import { CircleCheck, Copy, Info, MoreHorizontal, Pencil, Puzzle, ShieldAlert, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Appearance } from "@/lib/style-resolve";
import type { Recipe } from "@/widgets/recipe/types";
import { RecipePreview } from "./recipe-preview";
import type { Trust } from "./widgets-model";

export interface DetailAction {
  label: string;
  run: () => void;
  disabled?: boolean;
  /** Why it is off (the tooltip). */
  title?: string;
}

export interface WidgetDetailProps {
  name: string;
  /** "Recipe · made in Studio · 7 blocks", "Code widget · v1.2 · 86 KB", "Built in · Hardware". */
  kind: string;
  /** Unset for a built-in. */
  trust?: Trust;
  /** The preview: a recipe (drawn from its sample), or any node (a built-in's live stage, a fixture's picture). */
  recipe?: Recipe;
  preview?: ReactNode;
  appearance?: Appearance;
  pageStyle?: CSSProperties;
  onAdd: DetailAction;
  /** Edit recipe (a recipe), About (a code widget), Duplicate as a recipe (a built-in). */
  primary: DetailAction & { icon: "edit" | "about" | "duplicate" };
  onExport?: DetailAction;
  menu: DetailAction[];
  presets: string[];
  options: [string, string][];
  /** The screens it is on ("Perf heavy, Desk bar", "Not used yet"). */
  screens: string;
  /** A refused recipe or code widget: why. */
  refused?: string;
  /** A code widget's trust box actions: Settings › Widget publishers, and turning this one widget off (or on again). */
  onManageKeys?: () => void;
  onTurnOff?: DetailAction;
}

/** What a code widget's box says besides who signed it (Phase 6b): it runs on kiosks elsewhere, and whose keys these are. */
function CodeNotes() {
  return (
    <p data-code-notes className="mt-2 text-caption leading-snug text-ui-3">
      Kiosks on other devices that show it run it too. The keys and widgets here are this server's: a server the app does not run reads its own data folder.
    </p>
  );
}

/** The user-key box's two actions (and the owner's, Themely's: turning the widget off). */
function TrustActions({ onManageKeys, onTurnOff }: { onManageKeys?: () => void; onTurnOff?: DetailAction }) {
  if (!onManageKeys && !onTurnOff) return null;
  return (
    <div className="mt-2 flex gap-2">
      {onManageKeys && (
        <Button small onClick={onManageKeys}>
          Manage keys
        </Button>
      )}
      {onTurnOff && (
        <Button small variant="ghost" onClick={onTurnOff.run} disabled={onTurnOff.disabled} title={onTurnOff.title}>
          {onTurnOff.label}
        </Button>
      )}
    </div>
  );
}

/** Who stands behind a widget (the three states of screenshots 01-03, with Themely's and a refused one). */
export function TrustBox({ trust, onManageKeys, onTurnOff }: { trust: Trust; onManageKeys?: () => void; onTurnOff?: DetailAction }) {
  if (trust.kind === "owner" || trust.kind === "themely")
    return (
      <div data-trust={trust.kind} className="rounded-ui-lg border border-ui-ok/40 bg-ui-ok/8 px-4 py-3">
        <div className="flex items-center gap-2 text-body text-ui-1">
          <CircleCheck className="h-4 w-4 shrink-0 text-ui-ok" strokeWidth={1.75} aria-hidden />
          Signed by {trust.kind === "owner" ? "InfoPanel Studio" : "Themely"} · reviewed
        </div>
        <p className="mt-1 pl-6 text-caption leading-snug text-ui-2">Code widget with the same access as built-in widgets</p>
        <CodeNotes />
        <TrustActions onTurnOff={onTurnOff} />
      </div>
    );
  if (trust.kind === "refused")
    return (
      <div data-trust="refused" className="rounded-ui-lg border border-ui-danger/40 bg-ui-danger/10 px-4 py-3">
        <div className="flex items-center gap-2 text-body text-ui-1">
          <ShieldAlert className="h-4 w-4 shrink-0 text-ui-danger" strokeWidth={1.75} aria-hidden />
          Not loaded: the signature does not check out
        </div>
        <p className="mt-1 text-caption leading-snug text-ui-2">Refused: {trust.why}. It is not offered in Add and draws "Widget not available" where it is placed.</p>
        <TrustActions onManageKeys={onManageKeys} />
      </div>
    );
  if (trust.kind === "user-key")
    return (
      <div data-trust="user-key" className="rounded-ui-lg border border-ui-warn/40 bg-ui-warn/8 px-4 py-3">
        <div className="flex items-center gap-2 text-body text-ui-warn">
          <ShieldAlert className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
          Signed by {trust.signer} · not reviewed
        </div>
        <p className="mt-1 text-caption leading-snug text-ui-2">
          You trusted {trust.signer}'s key in Settings{trust.trusted ? ` on ${trust.trusted}` : ""}. Code widgets have the same access as built-in widgets: sensors, your screens and settings, and the network.
        </p>
        <CodeNotes />
        <TrustActions onManageKeys={onManageKeys} onTurnOff={onTurnOff} />
      </div>
    );
  return (
    <div data-trust="recipe" className="flex gap-3 rounded-ui-lg border border-ui-subtle px-4 py-3">
      <Puzzle className="mt-0.5 h-4 w-4 shrink-0 text-ui-3" strokeWidth={1.5} aria-hidden />
      <p className="text-caption leading-snug text-ui-2">Recipe: built from Studio's own blocks, no code. Follows your theme and works on every screen</p>
    </div>
  );
}

const ICONS = { edit: Pencil, about: Info, duplicate: Copy } as const;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-body">
      <span className="text-ui-3">{label}</span>
      <span className="min-w-0 truncate text-right text-ui-2">{value}</span>
    </div>
  );
}

export function WidgetDetail(p: WidgetDetailProps) {
  const PrimaryIcon = ICONS[p.primary.icon];
  return (
    <aside aria-label="Widget details" className="flex w-95 shrink-0 flex-col gap-4 overflow-y-auto border-l border-ui-subtle bg-ui-chrome p-5 font-ui">
      <div className="flex h-53.5 items-center justify-center overflow-hidden rounded-ui-lg border border-ui-subtle bg-ui-app p-4">
        {p.recipe ? <RecipePreview recipe={p.recipe} cells={p.recipe.size.default} sample appearance={p.appearance} pageStyle={p.pageStyle} fit={{ w: 334, h: 182 }} maxScale={1.2} /> : p.preview}
      </div>
      <div>
        <h2 className="truncate text-title font-medium text-ui-1">{p.name}</h2>
        <p className="mt-0.5 text-caption text-ui-3">{p.kind}</p>
      </div>
      {p.refused && (
        <p role="alert" className="rounded-ui-md border border-ui-danger/40 bg-ui-danger/10 px-3 py-2 text-caption text-ui-2">
          Not drawn: {p.refused}
        </p>
      )}
      {p.trust && <TrustBox trust={p.trust} onManageKeys={p.onManageKeys} onTurnOff={p.onTurnOff} />}
      <div className="flex flex-col gap-2">
        <Button variant="primary" className="w-full" onClick={p.onAdd.run} disabled={p.onAdd.disabled} title={p.onAdd.title}>
          {p.onAdd.label}
        </Button>
        <div className="flex items-center gap-2">
          <span className="flex-1" title={p.primary.title}>
            <Button className="w-full" icon={<PrimaryIcon strokeWidth={1.5} />} onClick={p.primary.run} disabled={p.primary.disabled}>
              {p.primary.label}
            </Button>
          </span>
          {p.onExport && (
            <Button className="flex-1" icon={<Upload strokeWidth={1.5} />} onClick={p.onExport.run} disabled={p.onExport.disabled} title={p.onExport.title}>
              {p.onExport.label}
            </Button>
          )}
          {p.menu.length > 0 && (
            <Menu.Root>
              <Menu.Trigger aria-label="More widget actions" className="grid h-8 w-8 shrink-0 place-items-center rounded-ui-md text-ui-3 hover:bg-ui-raised hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent data-popup-open:bg-ui-raised">
                <MoreHorizontal className="h-4 w-4" />
              </Menu.Trigger>
              <Menu.Content sideOffset={6} align="end">
                {p.menu.map((a, k) => (
                  <div key={a.label}>
                    {k > 0 && a.label.startsWith("Remove") && <div role="separator" />}
                    <Menu.Item danger={a.label.startsWith("Remove")} disabled={a.disabled} onClick={a.run}>
                      <span className="flex items-center gap-2">
                        {a.label.startsWith("Remove") && <Trash2 className="h-4 w-4" aria-hidden />}
                        {a.label}
                      </span>
                    </Menu.Item>
                  </div>
                ))}
              </Menu.Content>
            </Menu.Root>
          )}
        </div>
        {p.primary.disabled && p.primary.title && <p className="text-caption leading-snug text-ui-3">{p.primary.title}</p>}
      </div>
      <div className="border-t border-ui-subtle pt-4">
        <h3 className="mb-3 text-body text-ui-3">Presets</h3>
        <div className="flex flex-wrap gap-2">
          {p.presets.map((name) => (
            <span key={name} className="rounded-ui-md border border-ui-strong px-2.5 py-1 text-body text-ui-1">
              {name}
            </span>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-body text-ui-3">Options people can change</h3>
        {p.options.length ? p.options.map(([label, value]) => <Row key={label} label={label} value={value} />) : <p className="text-caption text-ui-3">None</p>}
      </div>
      <div className="pb-2">
        <Row label="On your screens" value={p.screens} />
      </div>
    </aside>
  );
}
