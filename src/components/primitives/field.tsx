"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";

export function Field({
  label,
  error,
  help,
  children,
  htmlFor,
}: {
  label: ReactNode;
  error?: string | null;
  help?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label className="tt-field" htmlFor={htmlFor}>
      <span className="tt-label">{label}</span>
      {children}
      {help ? <span className="tt-help">{help}</span> : null}
      {error ? <span className="tt-error-text" role="alert">{error}</span> : null}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cx("tt-input", className)} {...props} />;
  },
);
