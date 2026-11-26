import "server-only";
import { DatabaseError } from "@/infrastructure/database";
import { standalone, type DbSource } from "@/server/db/transaction";

// Organizer portal + live room tables (docs/sql/organizer-portal/01_tables.sql).
// Plain SQL, no package: every decision is made in the services. Times are
// plain TIMESTAMPs in UTC (SYSTIMESTAMP runs in UTC on this database) and are
// read back as ISO strings.

export type TeamRole =
  "CO_ORGANIZER" | "VENUE_PARTNER" | "SPONSOR" | "CHECK_IN" | "FINANCE";
export type LinkRole = Exclude<TeamRole, "CO_ORGANIZER">;

export type PortalEventRow = {
  id: number;
  title: string;
  organizer_id: string | null;
  organizer_name: string | null;
  // UTC wall-clock "yyyy-mm-ddThh:mi:ss" despite the view's _ist names.
  start_ist: string | null;
  end_ist: string | null;
};

export type TeamRow = {
  id: number;
  event_id: number;
  email: string;
  user_id: string | null;
  role: TeamRole;
  status: "INVITED" | "ACTIVE";
  invited_by: string | null;
  invited_on: string;
  activated_on: string | null;
};

export type LinkRow = {
  id: number;
  event_id: number;
  label: string;
  role: LinkRole;
  created_by: string | null;
  created_on: string;
  expires_on: string | null;
  revoked_on: string | null;
  views: number;
};

export type ParticipantRow = {
  id: number;
  event_id: number;
  user_id: string | null;
  category: string;
  active: string;
  full_name: string | null;
  email: string | null;
};

export type PanelistRow = {
  id: number;
  user_id: string | null;
  invited_email: string;
  status: string;
  panelist_role: string | null;
  full_name: string | null;
};

export type MoneyRow = {
  pending_claims: number;
  pending_amount: number;
  active_coupons: number;
};

export type WebinarRow = {
  event_id: number;
  audience: "interactive" | "livestream";
  recording: number;
  chat: number;
  hand_raise: number;
  captions: number;
  notice: string | null;
  restream_url: string | null;
  slides_url: string | null;
  replay_published: number;
  is_live: number;
  is_recording: number;
  is_ended: number;
  provider: string;
  room_ref: string | null;
  recording_url: string | null;
  hls_url: string | null;
};

/** The columns a webinar update may change. */
export type WebinarPatch = Partial<Omit<WebinarRow, "event_id" | "provider">>;

export type AttendanceRow = {
  id: number;
  last_joined: string | null;
  seconds_in: number;
};

const iso = (d: unknown): string | null =>
  d instanceof Date ? d.toISOString() : null;

const UTC_STAMP = `'YYYY-MM-DD"T"HH24:MI:SS'`;
/** A Date as the UTC text TO_TIMESTAMP(:x, UTC_STAMP) reads. */
const stamp = (d: Date) => d.toISOString().slice(0, 19);

const isDuplicate = (err: unknown) =>
  DatabaseError.is(err) && err.code === "UNIQUE_VIOLATION";

const TEAM_COLS = `id, event_id, email, user_id, role, status, invited_by,
  invited_on, activated_on`;
const LINK_COLS = `id, event_id, label, role, created_by, created_on,
  expires_on, revoked_on, views`;
const WEBINAR_COLS = `event_id, audience, recording, chat, hand_raise, captions,
  notice, restream_url, slides_url, replay_published, is_live, is_recording,
  is_ended, provider, room_ref, recording_url, hls_url`;

type RawTeam = Omit<TeamRow, "invited_on" | "activated_on"> & {
  invited_on: Date;
  activated_on: Date | null;
};
const team = (r: RawTeam): TeamRow => ({
  ...r,
  id: Number(r.id),
  event_id: Number(r.event_id),
  invited_on: iso(r.invited_on) ?? "",
  activated_on: iso(r.activated_on),
});

type RawLink = Omit<LinkRow, "created_on" | "expires_on" | "revoked_on"> & {
  created_on: Date;
  expires_on: Date | null;
  revoked_on: Date | null;
};
const link = (r: RawLink): LinkRow => ({
  ...r,
  id: Number(r.id),
  event_id: Number(r.event_id),
  created_on: iso(r.created_on) ?? "",
  expires_on: iso(r.expires_on),
  revoked_on: iso(r.revoked_on),
  views: Number(r.views ?? 0),
});

export function createPortalRepository(source: DbSource = standalone) {
  return {
    // ------------------------------------------------------------ reads
    async event(id: number): Promise<PortalEventRow | null> {
      const db = await source();
      return db.queryOne<PortalEventRow>(
        `SELECT id, title, organizer_id, organizer_name, start_ist, end_ist
           FROM gcode_portal_v_events WHERE id = :id`,
        { id },
      );
    },

    async participants(eventId: number): Promise<ParticipantRow[]> {
      const db = await source();
      const { rows } = await db.query<ParticipantRow>(
        `SELECT id, event_id, user_id, category, active, full_name, email
           FROM gcode_portal_v_participants WHERE event_id = :eventId`,
        { eventId },
      );
      return rows.map((r) => ({ ...r, id: Number(r.id) }));
    },

    async panelists(eventId: number): Promise<PanelistRow[]> {
      const db = await source();
      const { rows } = await db.query<PanelistRow>(
        `SELECT id, user_id, invited_email, status, panelist_role, full_name
           FROM gcode_portal_v_panelists WHERE event_id = :eventId`,
        { eventId },
      );
      return rows.map((r) => ({ ...r, id: Number(r.id) }));
    },

    async money(eventId: number): Promise<MoneyRow | null> {
      const db = await source();
      return db.queryOne<MoneyRow>(
        `SELECT pending_claims, pending_amount, active_coupons
           FROM gcode_portal_v_money WHERE event_id = :eventId`,
        { eventId },
      );
    },

    // ------------------------------------------------------------- team
    async teamByEvent(eventId: number): Promise<TeamRow[]> {
      const db = await source();
      const { rows } = await db.query<RawTeam>(
        `SELECT ${TEAM_COLS} FROM gcode_event_team
          WHERE event_id = :eventId ORDER BY invited_on`,
        { eventId },
      );
      return rows.map(team);
    },

    async teamMember(id: number): Promise<TeamRow | null> {
      const db = await source();
      const r = await db.queryOne<RawTeam>(
        `SELECT ${TEAM_COLS} FROM gcode_event_team WHERE id = :id`,
        { id },
      );
      return r ? team(r) : null;
    },

    async teamByToken(tokenHash: string): Promise<TeamRow | null> {
      const db = await source();
      const r = await db.queryOne<RawTeam>(
        `SELECT ${TEAM_COLS} FROM gcode_event_team WHERE token_hash = :tokenHash`,
        { tokenHash },
      );
      return r ? team(r) : null;
    },

    async isActiveCoOrganizer(eventId: number, userId: string) {
      const db = await source();
      return !!(await db.queryOne(
        `SELECT 1 AS found FROM gcode_event_team
          WHERE event_id = :eventId AND user_id = :userId
            AND role = 'CO_ORGANIZER' AND status = 'ACTIVE'
          FETCH FIRST 1 ROWS ONLY`,
        { eventId, userId },
      ));
    },

    /** False when that email is already on the event's team. */
    async addTeamMember(m: {
      eventId: number;
      email: string;
      role: TeamRole;
      tokenHash: string;
      invitedBy: string;
    }): Promise<boolean> {
      const db = await source();
      try {
        await db.execute(
          `INSERT INTO gcode_event_team (event_id, email, role, token_hash, invited_by)
           VALUES (:eventId, :email, :role, :tokenHash, :invitedBy)`,
          m,
        );
        return true;
      } catch (err) {
        if (isDuplicate(err)) return false;
        throw err;
      }
    },

    async setTeamRole(id: number, role: TeamRole): Promise<void> {
      const db = await source();
      await db.execute(
        "UPDATE gcode_event_team SET role = :role WHERE id = :id",
        {
          id,
          role,
        },
      );
    },

    /** Activates an invite once; a user already linked is kept. */
    async activateTeamMember(id: number, userId: string | null): Promise<void> {
      const db = await source();
      await db.execute(
        `UPDATE gcode_event_team
            SET status = 'ACTIVE', user_id = NVL(user_id, :userId),
                activated_on = NVL(activated_on, SYSTIMESTAMP)
          WHERE id = :id`,
        { id, userId },
      );
    },

    async removeTeamMember(id: number): Promise<void> {
      const db = await source();
      await db.execute("DELETE FROM gcode_event_team WHERE id = :id", { id });
    },

    // ------------------------------------------------------ share links
    async linksByEvent(eventId: number): Promise<LinkRow[]> {
      const db = await source();
      const { rows } = await db.query<RawLink>(
        `SELECT ${LINK_COLS} FROM gcode_event_share_links
          WHERE event_id = :eventId AND revoked_on IS NULL
          ORDER BY created_on DESC`,
        { eventId },
      );
      return rows.map(link);
    },

    async link(id: number): Promise<LinkRow | null> {
      const db = await source();
      const r = await db.queryOne<RawLink>(
        `SELECT ${LINK_COLS} FROM gcode_event_share_links WHERE id = :id`,
        { id },
      );
      return r ? link(r) : null;
    },

    async linkByToken(tokenHash: string): Promise<LinkRow | null> {
      const db = await source();
      const r = await db.queryOne<RawLink>(
        `SELECT ${LINK_COLS} FROM gcode_event_share_links
          WHERE token_hash = :tokenHash`,
        { tokenHash },
      );
      return r ? link(r) : null;
    },

    async addLink(l: {
      eventId: number;
      label: string;
      role: LinkRole;
      tokenHash: string;
      createdBy: string;
      expiresOn: Date | null;
    }): Promise<number> {
      const db = await source();
      const { id } = await db.call<{ id: number }>(
        `BEGIN
           INSERT INTO gcode_event_share_links
             (event_id, label, role, token_hash, created_by, expires_on)
           VALUES (:eventId, :label, :role, :tokenHash, :createdBy,
                   TO_TIMESTAMP(:expiresOn, ${UTC_STAMP}))
           RETURNING id INTO :id;
         END;`,
        {
          eventId: l.eventId,
          label: l.label,
          role: l.role,
          tokenHash: l.tokenHash,
          createdBy: l.createdBy,
          expiresOn: l.expiresOn ? stamp(l.expiresOn) : null,
          id: { out: "number" },
        },
      );
      return Number(id);
    },

    async revokeLink(id: number): Promise<void> {
      const db = await source();
      await db.execute(
        `UPDATE gcode_event_share_links SET revoked_on = SYSTIMESTAMP
          WHERE id = :id AND revoked_on IS NULL`,
        { id },
      );
    },

    async countLinkView(id: number): Promise<void> {
      const db = await source();
      await db.execute(
        "UPDATE gcode_event_share_links SET views = views + 1 WHERE id = :id",
        { id },
      );
    },

    // --------------------------------------------------------- check-in
    async checkIns(eventId: number): Promise<number[]> {
      const db = await source();
      const { rows } = await db.query<{ participant_id: number }>(
        `SELECT participant_id FROM gcode_event_checkins
          WHERE event_id = :eventId ORDER BY checked_in_on`,
        { eventId },
      );
      return rows.map((r) => Number(r.participant_id));
    },

    /** Idempotent: checking in twice keeps the first time. */
    async checkIn(eventId: number, participantId: number, by: string) {
      const db = await source();
      try {
        await db.execute(
          `INSERT INTO gcode_event_checkins (event_id, participant_id, checked_in_by)
           VALUES (:eventId, :participantId, :by)`,
          { eventId, participantId, by: by.slice(0, 120) },
        );
      } catch (err) {
        if (!isDuplicate(err)) throw err;
      }
    },

    async undoCheckIn(eventId: number, participantId: number) {
      const db = await source();
      await db.execute(
        `DELETE FROM gcode_event_checkins
          WHERE event_id = :eventId AND participant_id = :participantId`,
        { eventId, participantId },
      );
    },

    // ---------------------------------------------------------- webinar
    async webinar(eventId: number): Promise<WebinarRow | null> {
      const db = await source();
      return db.queryOne<WebinarRow>(
        `SELECT ${WEBINAR_COLS} FROM gcode_event_webinar WHERE event_id = :eventId`,
        { eventId },
      );
    },

    async webinarByRoom(roomRef: string): Promise<WebinarRow | null> {
      const db = await source();
      return db.queryOne<WebinarRow>(
        `SELECT ${WEBINAR_COLS} FROM gcode_event_webinar WHERE room_ref = :roomRef`,
        { roomRef },
      );
    },

    /** Creates the default row; a row made by a racing request is fine. */
    async ensureWebinar(eventId: number): Promise<void> {
      const db = await source();
      try {
        await db.execute(
          "INSERT INTO gcode_event_webinar (event_id) VALUES (:eventId)",
          { eventId },
        );
      } catch (err) {
        if (!isDuplicate(err)) throw err;
      }
    },

    /** Changes only the given columns. */
    async updateWebinar(eventId: number, patch: WebinarPatch): Promise<void> {
      const cols = Object.keys(patch).filter(
        (k) => (patch as Record<string, unknown>)[k] !== undefined,
      );
      if (!cols.length) return;
      // Column names come from WebinarPatch's keys, never from a request.
      for (const c of cols)
        if (!/^[a-z_]+$/.test(c)) throw new Error(`Bad column ${c}`);
      const db = await source();
      await db.execute(
        `UPDATE gcode_event_webinar
            SET ${cols.map((c) => `${c} = :${c}`).join(", ")},
                updated_on = SYSTIMESTAMP
          WHERE event_id = :eventId`,
        {
          eventId,
          ...(Object.fromEntries(
            cols.map((c) => [c, (patch as Record<string, unknown>)[c]]),
          ) as Record<string, string | number | null>),
        },
      );
    },

    // -------------------------------------------------------- live room
    async isBlocked(eventId: number, participantId: number) {
      const db = await source();
      return !!(await db.queryOne(
        `SELECT 1 AS found FROM gcode_event_live_blocks
          WHERE event_id = :eventId AND participant_id = :participantId`,
        { eventId, participantId },
      ));
    },

    async block(eventId: number, participantId: number): Promise<void> {
      const db = await source();
      try {
        await db.execute(
          `INSERT INTO gcode_event_live_blocks (event_id, participant_id)
           VALUES (:eventId, :participantId)`,
          { eventId, participantId },
        );
      } catch (err) {
        if (!isDuplicate(err)) throw err;
      }
    },

    /** False when this provider event was already recorded (a replay). */
    async recordProviderEvent(e: {
      eventId: number;
      providerEventId: string;
      kind: string;
      participantId: number | null;
    }): Promise<boolean> {
      const db = await source();
      try {
        await db.execute(
          `INSERT INTO gcode_event_live_events
             (event_id, provider_event_id, kind, participant_id)
           VALUES (:eventId, :providerEventId, :kind, :participantId)`,
          { ...e, providerEventId: e.providerEventId.slice(0, 200) },
        );
        return true;
      } catch (err) {
        if (isDuplicate(err)) return false;
        throw err;
      }
    },

    async attendance(
      eventId: number,
      participantId: number,
    ): Promise<AttendanceRow | null> {
      const db = await source();
      const r = await db.queryOne<{
        id: number;
        last_joined: Date | null;
        seconds_in: number;
      }>(
        `SELECT id, last_joined, seconds_in FROM gcode_event_live_attendance
          WHERE event_id = :eventId AND participant_id = :participantId`,
        { eventId, participantId },
      );
      return r
        ? {
            id: Number(r.id),
            last_joined: iso(r.last_joined),
            seconds_in: Number(r.seconds_in ?? 0),
          }
        : null;
    },

    async joined(eventId: number, participantId: number): Promise<void> {
      const db = await source();
      await db.execute(
        `MERGE INTO gcode_event_live_attendance a
         USING (SELECT :eventId AS event_id, :participantId AS participant_id FROM dual) s
            ON (a.event_id = s.event_id AND a.participant_id = s.participant_id)
         WHEN MATCHED THEN UPDATE SET a.last_joined = SYSTIMESTAMP, a.last_left = NULL
         WHEN NOT MATCHED THEN INSERT (event_id, participant_id, first_joined, last_joined)
           VALUES (s.event_id, s.participant_id, SYSTIMESTAMP, SYSTIMESTAMP)`,
        { eventId, participantId },
      );
    },

    async left(id: number, addSeconds: number): Promise<void> {
      const db = await source();
      await db.execute(
        `UPDATE gcode_event_live_attendance
            SET last_left = SYSTIMESTAMP, last_joined = NULL,
                seconds_in = seconds_in + :addSeconds
          WHERE id = :id`,
        { id, addSeconds },
      );
    },

    /** GCODE_EMAIL_API reads the recipient from the registration itself. */
    async sendJoinLinkEmail(
      eventId: number,
      participantId: number,
      joinUrl: string,
    ): Promise<void> {
      const db = await source();
      await db.call(
        `BEGIN gcode_email_api.send_join_link_email(:eventId, :participantId, :joinUrl); END;`,
        { eventId, participantId, joinUrl },
      );
    },
  };
}

export const portalRepository = createPortalRepository();
