import { useEffect, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { Film, Library, Trash2 } from "lucide-react";
import {
  AssetError,
  assetIdOf,
  deleteAsset,
  formatBytes,
  listAssets,
  unusedAssets,
  type Asset,
  type AssetKind,
} from "@/lib/assets";
import { cn } from "@/lib/utils";
import { ICON_BUTTON } from "./menu-styles";

interface LibraryState {
  assets: Asset[];
  /** Ids the saved config does not refer to. */
  unused: Set<string>;
}

interface MediaLibraryProps {
  kind: AssetKind;
  /** The field's current URL (highlighted, never offered as unused). */
  value: string | undefined;
  onPick: (url: string) => void;
}

const message = (err: unknown) => (err instanceof AssetError ? err.message : "Something went wrong.");

/**
 * The uploaded files of one kind in a popover: pick one, delete one, or
 * clean up every file the saved config no longer uses (after a confirm).
 */
export function MediaLibrary({ kind, value, onPick }: MediaLibraryProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LibraryState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const current = assetIdOf(value);

  const load = async () => {
    try {
      const [assets, unused] = await Promise.all([listAssets(), unusedAssets()]);
      setState({ assets, unused: new Set(unused.map((a) => a.id).filter((id) => id !== current)) });
      setError(null);
    } catch (err) {
      setError(message(err));
    }
  };

  // Reload on every open: uploads elsewhere and config saves change it.
  useEffect(() => {
    if (open) void load();
    else setConfirmCleanup(false);
  }, [open]);

  const remove = async (ids: string[]) => {
    try {
      for (const id of ids) await deleteAsset(id);
    } catch (err) {
      setError(message(err));
    }
    setConfirmCleanup(false);
    await load();
  };

  const shown = state?.assets.filter((a) => a.kind === kind) ?? [];
  const unusedIds = state ? state.assets.filter((a) => state.unused.has(a.id)).map((a) => a.id) : [];

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={ICON_BUTTON} title="Uploaded files">
        <Library className="h-3 w-3" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="z-[80]" sideOffset={4} align="end">
          <Popover.Popup className="w-72 space-y-2 rounded-ui-menu border border-ui-menu bg-ui-raised p-2 font-ui text-caption text-ui-2 shadow-ui-menu outline-none">
            <div className="flex items-center justify-between">
              <Popover.Title className="font-medium text-ui-1">Uploaded {kind === "image" ? "images" : "videos"}</Popover.Title>
              <span className="text-micro text-ui-4">{state ? `${shown.length} files` : "Loading…"}</span>
            </div>
            {error && (
              <div role="alert" className="text-micro text-ui-danger">
                {error}
              </div>
            )}
            {state && shown.length === 0 && (
              <p className="py-4 text-center text-micro text-ui-4">
                Nothing uploaded yet. Use Upload… or drop a file on the field.
              </p>
            )}
            {shown.length > 0 && (
              <div className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto">
                {shown.map((a) => (
                  <AssetTile
                    key={a.id}
                    asset={a}
                    selected={a.id === current}
                    unused={state?.unused.has(a.id) ?? false}
                    onPick={() => {
                      onPick(a.url);
                      setOpen(false);
                    }}
                    onDelete={() => void remove([a.id])}
                  />
                ))}
              </div>
            )}
            <CleanupRow
              count={unusedIds.length}
              confirming={confirmCleanup}
              onAsk={() => setConfirmCleanup(true)}
              onCancel={() => setConfirmCleanup(false)}
              onConfirm={() => void remove(unusedIds)}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** "Clean up unused" for every kind, behind an inline confirm. */
function CleanupRow({
  count,
  confirming,
  onAsk,
  onCancel,
  onConfirm,
}: {
  count: number;
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (confirming) {
    return (
      <div className="space-y-1.5 border-t border-ui-default pt-2">
        <p className="text-micro text-ui-4">
          Delete {count} file{count === 1 ? "" : "s"} the saved config doesn&apos;t use (images and videos)? Undo can&apos;t bring them back.
        </p>
        <div className="flex justify-end gap-1.5">
          <button type="button" onClick={onCancel} className="rounded-md border border-ui-default px-2 py-1 hover:bg-ui-hover">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-ui-danger px-2 py-1 text-white hover:opacity-90"
          >
            Delete {count}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between border-t border-ui-default pt-2">
      <span className="text-micro text-ui-4">{count} unused (images and videos)</span>
      <button
        type="button"
        disabled={count === 0}
        onClick={onAsk}
        className="rounded-md border border-ui-default px-2 py-1 hover:bg-ui-hover disabled:pointer-events-none disabled:opacity-40"
      >
        Clean up unused…
      </button>
    </div>
  );
}

function AssetTile({
  asset,
  selected,
  unused,
  onPick,
  onDelete,
}: {
  asset: Asset;
  selected: boolean;
  unused: boolean;
  onPick: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-md border bg-ui-app",
        selected ? "border-ui-accent" : "border-ui-default"
      )}
    >
      <button type="button" onClick={onPick} title={`Use this ${asset.kind}`} className="block aspect-video w-full">
        {asset.kind === "image" ? (
          <img src={asset.url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="relative block h-full w-full">
            {/* The first frame as the thumbnail. */}
            <video src={`${asset.url}#t=0.1`} muted preload="metadata" className="h-full w-full object-cover" />
            <Film className="absolute bottom-1 left-1 h-3 w-3 text-white drop-shadow" />
          </span>
        )}
      </button>
      <div className="flex items-center justify-between gap-1 px-1 py-0.5 text-[10px] text-ui-4">
        <span className="tabular-nums">{formatBytes(asset.size)}</span>
        {unused && <span className="rounded-full bg-ui-hover px-1 text-[10px] leading-tight">unused</span>}
      </div>
      <button
        type="button"
        onClick={() => (confirming ? onDelete() : setConfirming(true))}
        onBlur={() => setConfirming(false)}
        title={confirming ? "Click again to delete" : "Delete from the server"}
        className={cn(
          "absolute right-0.5 top-0.5 flex h-5 items-center justify-center rounded bg-black/60 px-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100",
          confirming && "bg-ui-danger opacity-100"
        )}
      >
        <Trash2 className="h-3 w-3" />
        {confirming && <span className="ml-0.5 text-[10px]">Delete?</span>}
      </button>
    </div>
  );
}
