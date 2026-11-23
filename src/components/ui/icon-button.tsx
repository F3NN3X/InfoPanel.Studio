import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CONTROL_MOTION, FOCUS_RING } from "./button";

const SIZE = { 26: "h-6.5 w-6.5", 28: "h-7 w-7", 30: "h-7.5 w-7.5", 32: "h-8 w-8" } as const;

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Required accessible name; also the tooltip. */
  label: string;
  size?: 26 | 28 | 30 | 32;
  /** Turns red on hover (delete). */
  danger?: boolean;
  /** Pressed / selected look. */
  active?: boolean;
  children: ReactNode;
}

/** Square icon-only button: 30 px, 26 small (28 and 32 where a bar still asks for them). */
export function IconButton({
  label,
  size = 28,
  danger,
  active,
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-ui-md text-ui-3",
        FOCUS_RING,
        CONTROL_MOTION,
        "disabled:opacity-40",
        SIZE[size],
        active ? "bg-ui-active text-ui-1" : "hover:bg-ui-hover hover:text-ui-1",
        danger && "hover:bg-ui-danger/15 hover:text-ui-danger",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
