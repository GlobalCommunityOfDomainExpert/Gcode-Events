import "server-only";
import { AppError } from "@/server/http/errors";
import {
  toEventDetail,
  toEventSummary,
  toTimelineEntry,
} from "./events.mapper";
import { eventsRepository } from "./events.repository";
import type { ListEventsQuery } from "./events.schemas";

// Public event reads. Callable directly from server components (metadata,
// OG image, client dashboard) as well as from the /api/v1/events routes.
//
// TODO(events): ORDS returned every event, drafts included, to anyone, and
// this keeps that so nothing breaks. Hiding DRAFT/APPROVAL_PENDING events
// from non-owners belongs here once the organizer pages are on /api/v1.
export const eventsService = {
  async list(query: ListEventsQuery) {
    const { rows, total } = await eventsRepository.list(query);
    return { items: rows.map(toEventSummary), total };
  },

  async get(id: number) {
    const row = await eventsRepository.getById(id);
    if (!row) throw AppError.notFound("Event");
    return toEventDetail(row);
  },

  async timeline(id: number) {
    return (await eventsRepository.timeline(id)).map(toTimelineEntry);
  },

  async faqs(id: number) {
    return (await eventsRepository.faqs(id)).map((r) => ({
      question: r.question,
      answer: r.answer,
      sortOrder: r.sort_order ?? 0,
    }));
  },

  async media(id: number) {
    return (await eventsRepository.media(id)).map((r) => ({
      url: r.url,
      sortOrder: r.sort_order ?? 0,
    }));
  },

  async socialLinks(id: number) {
    return (await eventsRepository.socialLinks(id)).map((r) => ({
      platform: r.platform,
      url: r.url,
    }));
  },

  // The database-stored cover, or null when there isn't one.
  async coverImage(
    id: number,
  ): Promise<{ bytes: Buffer; mime: string } | null> {
    const row = await eventsRepository.coverImage(id);
    if (!row?.cover_image?.length) return null;
    return {
      bytes: row.cover_image,
      mime: row.cover_image_mime || "application/octet-stream",
    };
  },
};
