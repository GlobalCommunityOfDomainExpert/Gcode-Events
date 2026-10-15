import { InputHTMLAttributes, forwardRef } from "react";

export interface RadioProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> {
  label?: string;
  error?: boolean;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ label, error = false, className = "", id, ...props }, ref) => {
    return (
      <label
        htmlFor={id}
        className="text-body text-text-primary inline-flex cursor-pointer items-center gap-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
      >
        <input
          id={id}
          type="radio"
          ref={ref}
          aria-invalid={error || undefined}
          className={`${error ? "border-danger focus-visible:ring-danger " : "border-border-light focus-visible:ring-primary "}accent-primary size-5 shrink-0 border focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed ${className}`}
          {...props}
        />
        {label}
      </label>
    );
  },
);

Radio.displayName = "Radio";
