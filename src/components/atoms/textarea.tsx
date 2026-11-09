import { TextareaHTMLAttributes, forwardRef } from "react";

export type TextareaVariant = "default" | "filled" | "outline";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: TextareaVariant;
  error?: boolean;
}

const variantClasses: Record<TextareaVariant, string> = {
  default: "bg-surface-light border-border-light hover:border-border-hover",
  filled: "bg-bg-light border-transparent hover:border-border-hover",
  outline: "bg-transparent border-border-light hover:border-border-hover",
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      variant = "default",
      error = false,
      disabled,
      rows = 4,
      className = "",
      ...props
    },
    ref,
  ) => {
    return (
      <textarea
        ref={ref}
        rows={rows}
        disabled={disabled}
        aria-invalid={error || undefined}
        className={
          `text-body text-text-primary w-full rounded-sm border px-4 py-2 shadow-inner ` +
          `placeholder:text-text-secondary transition-colors ` +
          `focus-visible:ring-4 focus-visible:outline-none ` +
          `disabled:bg-bg-light disabled:cursor-not-allowed disabled:opacity-50 ` +
          (error
            ? "border-danger focus-visible:ring-danger/15 "
            : `${variantClasses[variant]} focus-visible:border-primary focus-visible:ring-primary/10 `) +
          className
        }
        {...props}
      />
    );
  },
);

Textarea.displayName = "Textarea";
