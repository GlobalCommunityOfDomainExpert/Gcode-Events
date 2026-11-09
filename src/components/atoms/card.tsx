import { HTMLAttributes } from "react";

export type CardPadding = "sm" | "md" | "lg";

const paddingClass: Record<CardPadding, string> = {
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
  isDark?: boolean;
}

export function Card({
  padding = "sm",
  className = "",
  isDark,
  ...props
}: CardProps) {
  return (
    <div
      className={`border-border-light ${!isDark ? "bg-surface-light" : "bg-black"} rounded-md border shadow-sm ${paddingClass[padding]} ${className}`}
      {...props}
    />
  );
}
