import { useEffect, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { Film, Library } from "lucide-react";
import type { AssetKind } from "@/lib/assets";
import { listLibrary, type LibraryItem } from "@/lib/library";
import { buildIndex, collectionItems, fileUrl } from "@/lib/my-library/model";
import { cn } from "@/lib/utils";
import { ICON_BUTTON } from "./menu-styles";

interface BackgroundLibraryProps {
  kind: AssetKind;
  /** The field's current URL (highlighted). */
  value: string | undefined;
  onPick: (url: string) => void;
  /** Open the Library, from the empty state. */
  onOpenLibrary?: () => void;
}

/** The library's Backgrounds collection, of one kind: what a page background can pick. */
export const backgroundsOf = (items: LibraryItem[], kind: AssetKind): LibraryItem[] =>
  collectionItems("backgrounds", buildIndex(items)).filter((i) => i.kind === kind);

/** A popover of My library's Backgrounds (wide images, or videos): pick one. */
export function BackgroundLibrary({ kind, value, onPick, onOpenLibrary }: BackgroundLibraryProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const noun = kind === "image" ? "images" : "videos";

  // Reload on every open: the Library changes while the inspector stays.
  useEffect(() => {
    if (!open) return;
    let live = true;
    listLibrary().then(
      (all) => live && (setItems(backgroundsOf(all, kind)), setError(false)),
      () => live && setError(true),
    );
    return () => {
      live = false;
    };
  }, [open, kind, attempt]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={ICON_BUTTON} title="Backgrounds from My library">
        <Library className="h-3 w-3" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="z-[80]" sideOffset={4} align="end">
          <Popover.Popup className="w-72 space-y-2 rounded-[9px] border border-ui-menu bg-ui-raised p-2 font-ui text-[12px] text-ui-2 shadow-ui-menu outline-none">
            <div className="flex items-center justify-between">
              <Popover.Title className="font-medium text-ui-1">Background {noun}</Popover.Title>
              <span className="text-[11px] text-ui-4">{items ? `${items.length} in My library` : "Loading…"}</span>
            </div>
            {error && (
              <div role="alert" className="flex items-center justify-between gap-2 text-[11px] text-ui-danger">
                Could not load My library.
                <button type="button" onClick={() => setAttempt((n) => n + 1)} className="rounded-md px-1.5 py-0.5 text-ui-2 hover:bg-ui-hover hover:text-ui-1">
                  Try again
                </button>
              </div>
            )}
            {items && items.length === 0 && (
              <div className="space-y-2 py-3 text-center text-[11px] text-ui-4">
                <p>
                  No background {noun} yet. Add a wide {kind} to My library, or tag one Background.
                </p>
                {onOpenLibrary && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onOpenLibrary();
                    }}
                    className="rounded-md border border-ui-default px-2 py-1 text-ui-2 hover:bg-ui-hover"
                  >
                    Open Library
                  </button>
                )}
              </div>
            )}
            {items && items.length > 0 && (
              <div className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto">
                {items.map((item) => (
                  <BackgroundTile
                    key={item.id}
                    item={item}
                    selected={fileUrl(item) === value}
                    onPick={() => {
                      const url = fileUrl(item);
                      if (url) onPick(url);
                      setOpen(false);
                    }}
                  />
                ))}
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function BackgroundTile({ item, selected, onPick }: { item: LibraryItem; selected: boolean; onPick: () => void }) {
  const url = fileUrl(item);
  return (
    <button
      type="button"
      onClick={onPick}
      title={item.name}
      className={cn("relative block aspect-video overflow-hidden rounded-md border bg-ui-app", selected ? "border-ui-accent" : "border-ui-default")}
    >
      {item.kind === "image" ? (
        <img src={url} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <>
          <video src={`${url}#t=0.1`} muted preload="metadata" className="h-full w-full object-cover" />
          <Film className="absolute bottom-1 left-1 h-3 w-3 text-white drop-shadow" />
        </>
      )}
    </button>
  );
}
