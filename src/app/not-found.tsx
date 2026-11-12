import type { Metadata } from "next";
import { NotFoundView } from "@/components/layout/not-found-view";

export const metadata: Metadata = {
  title: "Page not found | GCODE Events",
  robots: { index: false },
};

export default function NotFound() {
  return <NotFoundView />;
}
