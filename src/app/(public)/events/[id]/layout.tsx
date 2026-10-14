import type { Metadata } from "next";
import { getEvent } from "@/lib/api/events";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  try {
    const detail = await getEvent(id);
    const title = `${detail.event_name} | GCODE Events`;
    const description =
      (detail.description ?? "").trim().slice(0, 125) ||
      "Discover this event on GCODE Events.";
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `/events/${id}`,
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

export default function EventDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
