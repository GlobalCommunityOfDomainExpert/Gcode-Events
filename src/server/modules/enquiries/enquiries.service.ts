import "server-only";
import { AppError } from "@/server/http/errors";
import { eventsRepository } from "@/server/modules/events/events.repository";
import { enquiriesRepository as repo } from "./enquiries.repository";
import type { SubmitEnquiryBody } from "./enquiries.schemas";

export const enquiriesService = {
  async submit(eventId: number, body: SubmitEnquiryBody): Promise<void> {
    if (!(await eventsRepository.exists(eventId)))
      throw AppError.notFound("Event");
    await repo.submit({
      eventId,
      email: body.email,
      phone: body.phone ?? null,
      message: body.message,
      topic: body.topic ?? null,
      image: body.image ?? null,
    });
  },
};
