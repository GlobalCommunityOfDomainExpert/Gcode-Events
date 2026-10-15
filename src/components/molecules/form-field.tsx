import { ReactNode } from "react";
import { Label } from "@/components/atoms";

export interface FormFieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  error?: string;
  disabled?: boolean;
  children: ReactNode;
}

export function FormField({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  disabled = false,
  children,
}: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label
        htmlFor={htmlFor}
        required={required}
        error={!!error}
        disabled={disabled}
      >
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-small text-text-secondary">{hint}</p>
      ) : null}
    </div>
  );
}
