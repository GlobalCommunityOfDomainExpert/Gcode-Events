import { SelectHTMLAttributes, forwardRef } from "react";

export type SelectVariant = "default" | "outline";
export type SelectSize = "sm" | "md";

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "size"
> {
  variant?: SelectVariant;
  size?: SelectSize;
  error?: boolean;
}

const sizeClasses: Record<SelectSize, string> = {
  sm: "h-9 px-2 text-small",
  md: "h-11 px-4 text-body",
};

const variantClasses: Record<SelectVariant, string> = {
  default: "bg-surface-light border-border-light hover:border-border-hover",
  outline: "bg-transparent border-border-light hover:border-border-hover",
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      variant = "default",
      size = "md",
      error = false,
      disabled,
      className = "",
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <select
        ref={ref}
        disabled={disabled}
        aria-invalid={error || undefined}
        className={
          `text-text-primary w-full rounded-sm border transition-colors ` +
          `focus-visible:ring-4 focus-visible:outline-none ` +
          `disabled:bg-bg-light disabled:cursor-not-allowed disabled:opacity-50 ` +
          (error
            ? "border-danger focus-visible:ring-danger/15 "
            : `${variantClasses[variant]} focus-visible:border-primary focus-visible:ring-primary/10 `) +
          `${sizeClasses[size]} ${className}`
        }
        {...props}
      >
        {children}
      </select>
    );
  },
);

Select.displayName = "Select";
