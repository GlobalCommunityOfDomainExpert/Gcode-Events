"use client";

import { useEffect } from "react";
import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Icon } from "@/components/atoms";

export interface ToastProps {
  message: string;
  tone?: "success" | "info" | "error";
  onDismiss?: () => void;
  duration?: number;
}

/** Small bottom-centre confirmation that dismisses itself after 5 seconds. */
export function Toast({
  message,
  tone = "success",
  onDismiss,
  duration = 5000,
}: ToastProps) {
  useEffect(() => {
    if (!onDismiss) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [onDismiss, duration]);

  return (
    <div
      role="status"
      className="bg-primary text-body fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-start gap-3 rounded-md px-4 py-3 text-white shadow-lg"
    >
      <span className="mt-0.5">
        <Icon
          icon={
            tone === "success"
              ? CircleCheck
              : tone === "error"
                ? TriangleAlert
                : Info
          }
          size="sm"
        />
      </span>
      <span>{message}</span>
    </div>
  );
}
