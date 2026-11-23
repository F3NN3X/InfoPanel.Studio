import { useEffect, useState } from "react";
import { DialogParts } from "@/components/ui/dialog";
import { Ban, X } from "lucide-react";
import { IconGrid } from "@/components/ui/icon-grid";
import type { ProfilePage } from "@/lib/layout";
import { PAGE_ICONS } from "./page-icons";

/** The icon picker: a searchable grid of the page icons, and None. */
export function PageIconDialog({
  page,
  onPick,
  onClose,
}: {
  page: ProfilePage | undefined;
  onPick: (icon: string | undefined) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => setQuery(""), [page?.id]);
  const q = query.trim().toLowerCase();
  const icons = [
    { id: "", label: "None", icon: <Ban /> },
    ...Object.entries(PAGE_ICONS)
      .filter(([name]) => name.includes(q))
      .map(([name, Icon]) => ({ id: name, label: name, icon: <Icon /> })),
  ];
  return (
    <DialogParts.Root open={page !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogParts.Content className="w-[min(22rem,calc(100vw-2rem))] bg-ui-tile">
        <div className="flex items-center">
          <DialogParts.Title className="flex-1 text-sm font-medium">Icon for {page?.name}</DialogParts.Title>
          <DialogParts.Close title="Close (Esc)" aria-label="Close" className="grid h-8 w-8 place-items-center rounded-md text-ui-3 transition-colors hover:text-ui-1">
            <X className="h-4 w-4" />
          </DialogParts.Close>
        </div>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons"
          aria-label="Search icons"
          className="h-7.5 w-full rounded-md border border-ui-strong bg-ui-app px-2 text-body text-ui-1 outline-none focus:border-ui-accent"
        />
        <div className="max-h-64 overflow-y-auto">
          <IconGrid
            label="Page icon"
            columns={8}
            icons={icons}
            value={page?.icon ?? ""}
            onChange={(id) => {
              onPick(id || undefined);
              onClose();
            }}
          />
        </div>
      </DialogParts.Content>
    </DialogParts.Root>
  );
}
