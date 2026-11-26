-- Least-privilege database user for the Next.js backend
-- (src/infrastructure/database). Run once as ADMIN; NOT applied automatically.
--
-- Why: the app should never connect as ADMIN or as the schema owner
-- WKSP_GCODE2. It gets EXECUTE on the PL/SQL packages it calls (they run with
-- definer rights, so it needs no grants on the tables those packages touch)
-- plus direct SELECT/DML only on tables its own SQL reads or writes.
--
-- After running, set in .env.local:
--   DB_USER=GCODE_EVENTS_APP
--   DB_PASSWORD=<the password below>
--   DB_SCHEMA=WKSP_GCODE2        -- so unqualified names resolve to the owner
--
-- Phase 2 (logic ported to TypeScript) adds table grants here as each
-- package is replaced; revoke the package EXECUTE when its port lands.

CREATE USER gcode_events_app IDENTIFIED BY "<choose-a-strong-password>";
GRANT CREATE SESSION TO gcode_events_app;

-- ── Phase 1: packages the events app calls ────────────────────────────────
GRANT EXECUTE ON wksp_gcode2.gcode_events_api              TO gcode_events_app;
GRANT EXECUTE ON wksp_gcode2.gcode_event_participants_api  TO gcode_events_app;
GRANT EXECUTE ON wksp_gcode2.gcode_rounds_api              TO gcode_events_app;
GRANT EXECUTE ON wksp_gcode2.gcode_ratings_api             TO gcode_events_app;
GRANT EXECUTE ON wksp_gcode2.gcode_panelists_api           TO gcode_events_app;
GRANT EXECUTE ON wksp_gcode2.gcode_coupons_api             TO gcode_events_app;
GRANT EXECUTE ON wksp_gcode2.gcode_upi_claims_api          TO gcode_events_app;
GRANT EXECUTE ON wksp_gcode2.gcode_cashfree_payments_api   TO gcode_events_app;
GRANT EXECUTE ON wksp_gcode2.gcode_booking_payments_api    TO gcode_events_app;
GRANT EXECUTE ON wksp_gcode2.gcode_event_adv_q_api         TO gcode_events_app;
GRANT EXECUTE ON wksp_gcode2.gcode_event_enquiries_api     TO gcode_events_app;
GRANT EXECUTE ON wksp_gcode2.gcode_event_interest_api      TO gcode_events_app;
GRANT EXECUTE ON wksp_gcode2.gcode_email_api               TO gcode_events_app;
GRANT EXECUTE ON wksp_gcode2.gcode_mail_api                TO gcode_events_app;

-- ── Tables read directly by TypeScript repositories ───────────────────────
-- Lookups (src/server/modules/lookups)
GRANT SELECT ON wksp_gcode2.event_types      TO gcode_events_app;
GRANT SELECT ON wksp_gcode2.event_status     TO gcode_events_app;
GRANT SELECT ON wksp_gcode2.mode_of_events   TO gcode_events_app;
GRANT SELECT ON wksp_gcode2.event_categories TO gcode_events_app;

-- Auth (src/server/modules/auth) — ported off AUTH_PKG, which can't run
-- outside ORDS (it writes responses with HTP.print).
GRANT SELECT, INSERT, UPDATE         ON wksp_gcode2.gcode_users           TO gcode_events_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON wksp_gcode2.gcode_pending_users   TO gcode_events_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON wksp_gcode2.gcode_password_resets TO gcode_events_app;
GRANT SELECT                         ON wksp_gcode2.gcode_roles           TO gcode_events_app;

-- Public event reads (src/server/modules/events)
GRANT SELECT ON wksp_gcode2.events                   TO gcode_events_app;
GRANT SELECT ON wksp_gcode2.event_category_map       TO gcode_events_app;
GRANT SELECT ON wksp_gcode2.gcode_event_participants TO gcode_events_app;
GRANT SELECT ON wksp_gcode2.event_timeline           TO gcode_events_app;
GRANT SELECT ON wksp_gcode2.gcode_event_faqs         TO gcode_events_app;
GRANT SELECT ON wksp_gcode2.event_media              TO gcode_events_app;
GRANT SELECT ON wksp_gcode2.event_social_links       TO gcode_events_app;

-- Organizer writes (src/server/modules/events, modules/questions). Writes go
-- through the packages (EXECUTE above) except these direct statements:
GRANT SELECT         ON wksp_gcode2.mode_of_events                  TO gcode_events_app;
GRANT UPDATE         ON wksp_gcode2.events                          TO gcode_events_app; -- cover/card image upload, linked card image
-- Co-branding partners: full replace (DELETE + INSERT) in the save transaction.
GRANT SELECT, INSERT, DELETE ON wksp_gcode2.gcode_event_partners    TO gcode_events_app;
GRANT SELECT         ON wksp_gcode2.gcode_event_questions           TO gcode_events_app;
GRANT SELECT         ON wksp_gcode2.gcode_event_question_options    TO gcode_events_app;
GRANT SELECT         ON wksp_gcode2.gcode_event_adv_q_settings      TO gcode_events_app;
GRANT SELECT         ON wksp_gcode2.gcode_event_adv_option_settings TO gcode_events_app;
GRANT SELECT         ON wksp_gcode2.gcode_event_adv_options         TO gcode_events_app;
-- event_social_links has no FK to events (no cascade): the app deletes an
-- event's links itself before delete_event.
GRANT DELETE         ON wksp_gcode2.event_social_links              TO gcode_events_app;

-- Participants (src/server/modules/participants)
GRANT SELECT ON wksp_gcode2.participant_question_answers TO gcode_events_app;
GRANT SELECT ON wksp_gcode2.gcode_event_adv_answers      TO gcode_events_app;
GRANT SELECT ON wksp_gcode2.participant_youtube_tracks   TO gcode_events_app;
GRANT SELECT ON wksp_gcode2.participant_team_members     TO gcode_events_app;

-- Payments (src/server/modules/coupons, modules/upi-claims). Writes go
-- through the packages; these reads are direct: existence/ownership checks,
-- and the claim list (its cursor returns reviewed_by as a NUMBER, which
-- loses precision for 38-digit user ids).
GRANT SELECT ON wksp_gcode2.gcode_coupons            TO gcode_events_app;
GRANT SELECT ON wksp_gcode2.gcode_upi_payment_claims TO gcode_events_app;

-- Rate limiting (src/server/rate-limit): the app owns this table's rows.
-- Table: docs/sql/rate-limits/00_run_on_prod.sql.
GRANT SELECT, INSERT, UPDATE, DELETE ON wksp_gcode2.gcode_rate_limits TO gcode_events_app;

-- Organizer portal + live room (src/server/modules/portal). Tables and views
-- from docs/sql/organizer-portal/01_tables.sql; plain SQL, no package. The
-- views read the existing tables as their owner, so no grants on those.
GRANT SELECT, INSERT, UPDATE, DELETE ON wksp_gcode2.gcode_event_team            TO gcode_events_app;
GRANT SELECT, INSERT, UPDATE         ON wksp_gcode2.gcode_event_share_links     TO gcode_events_app;
GRANT SELECT, INSERT, DELETE         ON wksp_gcode2.gcode_event_checkins        TO gcode_events_app;
GRANT SELECT, INSERT, UPDATE         ON wksp_gcode2.gcode_event_webinar         TO gcode_events_app;
GRANT SELECT, INSERT, UPDATE         ON wksp_gcode2.gcode_event_live_attendance TO gcode_events_app;
GRANT INSERT                         ON wksp_gcode2.gcode_event_live_events     TO gcode_events_app;
GRANT SELECT, INSERT                 ON wksp_gcode2.gcode_event_live_blocks     TO gcode_events_app;
GRANT SELECT ON wksp_gcode2.gcode_portal_v_events       TO gcode_events_app;
GRANT SELECT ON wksp_gcode2.gcode_portal_v_participants TO gcode_events_app;
GRANT SELECT ON wksp_gcode2.gcode_portal_v_panelists    TO gcode_events_app;
GRANT SELECT ON wksp_gcode2.gcode_portal_v_money        TO gcode_events_app;
-- The join-link email is GCODE_EMAIL_API.send_join_link_email (EXECUTE above).

-- Event delete (src/server/modules/events/events.delete.service.ts): the
-- purge procedure from docs/sql/event-delete/00_run_on_prod.sql replaces
-- gcode_events_api.delete_event.
GRANT EXECUTE ON wksp_gcode2.gcode_purge_event TO gcode_events_app;
