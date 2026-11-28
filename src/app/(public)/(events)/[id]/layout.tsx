import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withBasePath } from "@/lib/base-path";
import { eventsService } from "@/server/modules/events/events.service";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  try {
    const detail = await eventsService.get(Number(id));
    const title = `${detail.title} | GCODE Events`;
    const description =
      (detail.description ?? "").trim().slice(0, 125) ||
      "Discover this event on GCODE Events.";
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: withBasePath(`/${id}`),
        siteName: "GCODE Events",
        locale: "en_IN",
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
      },
    };
  } catch {
    return {};
  }
}

// Event pages sit at the root (/<id>), so this segment also catches any
// unknown top-level path: only numeric ids are events.
export default async function EventDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return children;
}
