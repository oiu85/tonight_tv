"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
export type ButtonSize = "default" | "sm" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  label?: string;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "default", loading, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cx(
        "tt-button",
        variant === "primary" && "tt-button-primary",
        variant === "ghost" && "tt-button-ghost",
        variant === "danger" && "tt-button-danger",
        variant === "soft" && "tt-button-soft",
        size === "sm" && "tt-button-sm",
        size === "lg" && "tt-button-lg",
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="tt-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  children,
  className,
  ...props
}: ButtonProps & { label: string; children: React.ReactNode }) {
  return (
    <Button
      className={cx("tt-icon-button", className)}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </Button>
  );
}
