import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The focus ring every chrome control shares: 2 px accent, offset 2. */
export const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";
/** Hover, press and toggle motion: colour and transform on the one curve. */
export const CONTROL_MOTION = "transition-[color,background-color,border-color,opacity,transform] duration-(--ui-dur-fast) ease-ui active:scale-[0.98]";

/** One primary per view; secondary for other real actions; ghost to dismiss; danger is red text until confirmed. */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Readonly<Record<ButtonVariant, string>> = {
  primary: "bg-ui-inverse text-ui-inverse-fg hover:bg-white",
  secondary: "border border-ui-strong bg-ui-raised text-ui-1 hover:border-ui-hover-edge",
  ghost: "text-ui-2 hover:bg-ui-raised hover:text-ui-1",
  danger: "text-ui-danger hover:bg-ui-danger/12",
};

interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  /** 32 px by default, 28 px small. */
  small?: boolean;
  /** A 16 px icon before the label. */
  icon?: ReactNode;
}

/** The chrome's text button. */
export function Button({ variant = "secondary", small, icon, className, children, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-ui-md text-body font-medium [&_svg]:h-4 [&_svg]:w-4",
        FOCUS_RING,
        CONTROL_MOTION,
        "disabled:pointer-events-none disabled:opacity-40",
        small ? "h-7 rounded-ui-sm px-2.5" : "h-8 px-3",
        VARIANT[variant],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
