import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
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
    <Dialog.Root open={page !== undefined} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/55" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[22rem] -translate-x-1/2 -translate-y-1/2 space-y-3 rounded-xl border border-ui-strong bg-ui-tile p-4 font-ui text-ui-1 shadow-ui-modal outline-none">
          <div className="flex items-center">
            <Dialog.Title className="flex-1 text-sm font-semibold">Icon for {page?.name}</Dialog.Title>
            <Dialog.Close title="Close (Esc)" className="text-ui-3 transition-colors hover:text-ui-1">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons"
            aria-label="Search icons"
            className="h-[30px] w-full rounded-md border border-ui-strong bg-ui-app px-2 text-[12.5px] text-ui-1 outline-none focus:border-ui-accent"
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
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
