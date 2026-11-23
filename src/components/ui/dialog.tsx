import type { ComponentProps, ReactNode } from "react";
import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

// z-50 is the layer every dialog had before this primitive: the studio's hover previews (z-60) stay above it.
/** The dim behind a modal. */
export const DIALOG_BACKDROP = "fixed inset-0 z-50 bg-black/60";
/** Every modal's frame: centred over the window, the strong edge and the modal shadow. */
export const DIALOG_FRAME = "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 border border-ui-strong font-ui text-ui-1 shadow-ui-modal outline-none";
/** The form card inside the frame: a form's width, padded, stacked, scrolling when taller than the window. */
export const DIALOG_FORM = "max-h-[calc(100vh-2rem)] w-[min(26rem,calc(100vw-2rem))] space-y-3 overflow-y-auto rounded-xl bg-ui-raised p-4";
export const DIALOG_TITLE = "text-lead font-medium text-ui-1";
export const DIALOG_DESCRIPTION = "text-caption leading-relaxed text-ui-3";

interface ContentProps {
  /** "form" (the default): the padded card. "panel": the frame only, for a dialog that lays out its own header, body and footer. */
  layout?: "form" | "panel";
  /** Added to the popup (a width, a layout, a z-index); wins over the shared look where they overlap. */
  className?: string;
  /** Added to the backdrop (a z-index above a layer that sits over the usual one). */
  backdropClassName?: string;
  children: ReactNode;
}

type DialogContentProps = ContentProps & Omit<ComponentProps<typeof BaseDialog.Popup>, "className" | "children">;
type AlertDialogContentProps = ContentProps & Omit<ComponentProps<typeof BaseAlertDialog.Popup>, "className" | "children">;

/** A title or description part with a plain class string, merged over the shared one. */
type Text<P> = Omit<P, "className"> & { className?: string };

/** A dialog's portal, backdrop and popup in one. */
function DialogContent({ layout = "form", className, backdropClassName, children, ...popup }: DialogContentProps) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className={cn(DIALOG_BACKDROP, backdropClassName)} />
      <BaseDialog.Popup className={cn(DIALOG_FRAME, layout === "form" && DIALOG_FORM, className)} {...popup}>
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

/** An alert dialog's portal, backdrop and popup in one. */
function AlertDialogContent({ layout = "form", className, backdropClassName, children, ...popup }: AlertDialogContentProps) {
  return (
    <BaseAlertDialog.Portal>
      <BaseAlertDialog.Backdrop className={cn(DIALOG_BACKDROP, backdropClassName)} />
      <BaseAlertDialog.Popup className={cn(DIALOG_FRAME, layout === "form" && DIALOG_FORM, className)} {...popup}>
        {children}
      </BaseAlertDialog.Popup>
    </BaseAlertDialog.Portal>
  );
}

function DialogTitle({ className, ...props }: Text<ComponentProps<typeof BaseDialog.Title>>) {
  return <BaseDialog.Title className={cn(DIALOG_TITLE, className)} {...props} />;
}

function DialogDescription({ className, ...props }: Text<ComponentProps<typeof BaseDialog.Description>>) {
  return <BaseDialog.Description className={cn(DIALOG_DESCRIPTION, className)} {...props} />;
}

function AlertDialogTitle({ className, ...props }: Text<ComponentProps<typeof BaseAlertDialog.Title>>) {
  return <BaseAlertDialog.Title className={cn(DIALOG_TITLE, className)} {...props} />;
}

function AlertDialogDescription({ className, ...props }: Text<ComponentProps<typeof BaseAlertDialog.Description>>) {
  return <BaseAlertDialog.Description className={cn(DIALOG_DESCRIPTION, className)} {...props} />;
}

/**
 * A modal: `<DialogParts.Root open onOpenChange><DialogParts.Content><DialogParts.Title/>…</DialogParts.Content></DialogParts.Root>`.
 * Focus moves in on open, is trapped while open and returns on close; Escape and a backdrop click close it (Base UI).
 */
export const DialogParts = {
  Root: BaseDialog.Root,
  Trigger: BaseDialog.Trigger,
  Content: DialogContent,
  Title: DialogTitle,
  Description: DialogDescription,
  Close: BaseDialog.Close,
};

/** A confirmation that a backdrop click does not dismiss; otherwise the same parts as `DialogParts`. */
export const AlertDialogParts = {
  Root: BaseAlertDialog.Root,
  Trigger: BaseAlertDialog.Trigger,
  Content: AlertDialogContent,
  Title: AlertDialogTitle,
  Description: AlertDialogDescription,
  Close: BaseAlertDialog.Close,
};
