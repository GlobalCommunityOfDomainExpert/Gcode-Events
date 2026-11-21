import "server-only";
import { standalone, type DbSource } from "@/server/db/transaction";

// UPI claims. Writes go through GCODE_UPI_CLAIMS_API (Phase 1). submit and
// reject don't commit (autocommit covers them). confirm calls
// create_participant, which COMMITs the registration before the claim row
// is updated — so it must not run inside transaction().
//
// Reads are direct: list_upi_claims returns reviewed_by as a NUMBER, which
// loses precision for 38-digit user ids.

export type UpiClaimRow = {
  id: number;
  event_id: number;
  email: string;
  full_name: string;
  utr: string;
  amount_claimed: number;
  status: string;
  submitted_on: Date;
  reviewed_by: string | null;
  reviewed_on: Date | null;
  participant_id: number | null;
};

const COLUMNS = `id, event_id, email, full_name, utr, amount_claimed, status,
  submitted_on, TO_CHAR(reviewed_by) AS reviewed_by, reviewed_on, participant_id`;

export function createUpiClaimsRepository(source: DbSource = standalone) {
  return {
    async listByEvent(eventId: number): Promise<UpiClaimRow[]> {
      const db = await source();
      const { rows } = await db.query<UpiClaimRow>(
        `SELECT ${COLUMNS} FROM gcode_upi_payment_claims
          WHERE event_id = :eventId ORDER BY submitted_on DESC`,
        { eventId },
      );
      return rows;
    },

    async getById(id: number): Promise<UpiClaimRow | null> {
      const db = await source();
      return db.queryOne<UpiClaimRow>(
        `SELECT ${COLUMNS} FROM gcode_upi_payment_claims WHERE id = :id`,
        { id },
      );
    },

    async submit(input: {
      eventId: number;
      email: string;
      fullName: string;
      utr: string;
      amountClaimed: number;
    }): Promise<number> {
      const db = await source();
      const out = await db.call<{ id: number }>(
        `BEGIN gcode_upi_claims_api.submit_upi_claim(
           p_event_id => :eventId, p_email => :email, p_full_name => :fullName,
           p_utr => :utr, p_amount_claimed => :amountClaimed,
           p_claim_id => :id); END;`,
        { ...input, id: { out: "number" } },
      );
      return out.id;
    },

    async confirm(id: number, reviewerId: string): Promise<number> {
      const db = await source();
      const out = await db.call<{ participantId: number }>(
        `BEGIN gcode_upi_claims_api.confirm_upi_claim(
           p_claim_id => :id, p_reviewer_id => TO_NUMBER(:reviewerId),
           p_participant_id => :participantId); END;`,
        { id, reviewerId, participantId: { out: "number" } },
      );
      return out.participantId;
    },

    async reject(id: number, reviewerId: string): Promise<void> {
      const db = await source();
      await db.call(
        `BEGIN gcode_upi_claims_api.reject_upi_claim(
           p_claim_id => :id, p_reviewer_id => TO_NUMBER(:reviewerId)); END;`,
        { id, reviewerId },
      );
    },
  };
}

export const upiClaimsRepository = createUpiClaimsRepository();
