import { useState } from "react";
import { ArrowUpRight, Copy, PenLine, Trash2 } from "lucide-react";
import type { LibraryItem } from "@/lib/library";
import { ProfileThumb } from "@/components/infopanel/profile-thumb";
import { RenameInput } from "../rename-input";
import { aspectOf, Badge, CARD_BUTTON, ProfileCard } from "./profile-card";
import type { SavedProfiles } from "./use-saved-profiles";

interface SavedCardProps {
  item: LibraryItem;
  api: SavedProfiles;
  /** What a click does with it: "Open" (the home) or "Place" (the manager). */
  action: string;
  detail?: string;
  /** Offer Rename (the manager). */
  renamable?: boolean;
  onOpen: () => void;
}

const counted = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;

/** A saved InfoPanel profile of the Library as a card: open it, duplicate it, rename it, or remove it (asked first). */
export function SavedCard({ item, api, action, detail, renamable, onOpen }: SavedCardProps) {
  const [removing, setRemoving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const width = Number(item.meta.width) || 0;
  const height = Number(item.meta.height) || 0;
  return (
    <ProfileCard
      name={item.name}
      nameField={
        renaming ? (
          <RenameInput
            initial={item.name}
            label="Profile name"
            onDone={(name) => {
              setRenaming(false);
              if (name && name !== item.name) void api.rename(item, name);
            }}
          />
        ) : undefined
      }
      badges={<Badge title="Saved in your Library, not on a screen yet">Saved</Badge>}
      detail={detail}
      meta={`${width}×${height} · ${counted(Number(item.meta.items) || 0)}`}
      aspect={aspectOf(width, height)}
      thumb={<ProfileThumb item={item} />}
      onClick={onOpen}
      label={`${action} ${item.name}`}
    >
      {removing ? (
        <>
          <span className="min-w-0 flex-1 truncate px-1.5 text-[12px] text-ui-3">Remove from the Library?</span>
          <button type="button" onClick={() => void api.remove(item)} className={`${CARD_BUTTON} text-ui-danger`}>
            Remove
          </button>
          <button type="button" onClick={() => setRemoving(false)} className={CARD_BUTTON}>
            Keep
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={onOpen} className={CARD_BUTTON}>
            <ArrowUpRight className="h-3.5 w-3.5" />
            {action}
          </button>
          <button type="button" onClick={() => void api.duplicate(item)} className={CARD_BUTTON}>
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </button>
          {renamable && (
            <button type="button" onClick={() => setRenaming(true)} className={CARD_BUTTON} title="Rename" aria-label={`Rename ${item.name}`}>
              <PenLine className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" onClick={() => setRemoving(true)} className={`${CARD_BUTTON} ml-auto`} aria-label={`Remove ${item.name}`} title="Remove from the Library">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </ProfileCard>
  );
}
