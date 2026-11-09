import { InputHTMLAttributes, forwardRef } from "react";
import { LucideIcon } from "lucide-react";
import { Icon } from "./icon";

export type InputSize = "sm" | "md" | "lg";

export interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size"
> {
  size?: InputSize;
  error?: boolean;
  icon?: LucideIcon;
}

const sizeClasses: Record<InputSize, string> = {
  sm: "h-9 px-2 text-small",
  md: "h-11 px-4 text-body",
  lg: "h-12 px-6 text-large",
};

// Matches each size's own left padding + icon width so text doesn't crowd it.
const iconPaddingClasses: Record<InputSize, string> = {
  sm: "!pl-8",
  md: "!pl-10",
  lg: "!pl-11",
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { size = "md", error = false, disabled, icon, className = "", ...props },
    ref,
  ) => {
    const input = (
      <input
        ref={ref}
        disabled={disabled}
        aria-invalid={error || undefined}
        className={
          `bg-surface-light text-text-primary w-full rounded-sm border shadow-inner ` +
          // Lower-opacity than body text so a placeholder never reads as an
          // already-filled value at a glance.
          `placeholder:text-text-secondary/60 transition-colors ` +
          `focus-visible:ring-4 focus-visible:outline-none ` +
          `disabled:bg-bg-light disabled:cursor-not-allowed disabled:opacity-50 ` +
          (error
            ? "border-danger focus-visible:ring-danger/15 "
            : "border-border-light hover:border-border-hover focus-visible:border-primary focus-visible:ring-primary/10 ") +
          `${sizeClasses[size]} ${icon ? iconPaddingClasses[size] : ""} ${className}`
        }
        {...props}
      />
    );

    if (!icon) return input;

    return (
      <div className="relative flex items-center">
        <span className="text-text-secondary pointer-events-none absolute left-3">
          <Icon icon={icon} size={size === "lg" ? "md" : "sm"} />
        </span>
        {input}
      </div>
    );
  },
);

Input.displayName = "Input";
