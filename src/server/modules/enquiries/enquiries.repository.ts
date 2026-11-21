import "server-only";
import { standalone, type DbSource } from "@/server/db/transaction";

// GCODE_EVENT_ENQUIRIES_API (Phase 1). submit_enquiry doesn't commit;
// autocommit covers the standalone call. Long strings (the image data URL)
// bind as CLOB automatically.

export function createEnquiriesRepository(source: DbSource = standalone) {
  return {
    async submit(input: {
      eventId: number;
      email: string;
      phone: string | null;
      message: string;
      topic: string | null;
      image: string | null;
    }): Promise<void> {
      const db = await source();
      await db.call(
        `BEGIN gcode_event_enquiries_api.submit_enquiry(
           p_event_id => :eventId, p_email => :email, p_phone => :phone,
           p_message => :message, p_topic => :topic, p_image => :image); END;`,
        input,
      );
    },
  };
}

export const enquiriesRepository = createEnquiriesRepository();
