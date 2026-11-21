import "server-only";
import { standalone, type DbSource } from "@/server/db/transaction";

// GCODE_EVENT_INTEREST_API (Phase 1). express_interest doesn't commit;
// autocommit covers the standalone call. It is idempotent per
// (event, email) — a repeat only refreshes the phone.

export function createInterestRepository(source: DbSource = standalone) {
  return {
    async expressAsUser(eventId: number, userId: string): Promise<void> {
      const db = await source();
      await db.call(
        `BEGIN gcode_event_interest_api.express_interest(
           p_event_id => :eventId, p_user_id => TO_NUMBER(:userId)); END;`,
        { eventId, userId },
      );
    },

    // The package checks the email has a verified, unexpired OTP
    // (ORA-20043 otherwise).
    async expressAsGuest(
      eventId: number,
      email: string,
      phone: string | null,
    ): Promise<void> {
      const db = await source();
      await db.call(
        `BEGIN gcode_event_interest_api.express_interest(
           p_event_id => :eventId, p_email => :email, p_phone => :phone); END;`,
        { eventId, email, phone },
      );
    },
  };
}

export const interestRepository = createInterestRepository();
