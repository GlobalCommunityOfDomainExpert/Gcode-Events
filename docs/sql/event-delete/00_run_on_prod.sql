-- Event delete guard. Run in SQL Workshop > SQL Scripts (schema WKSP_GCODE2).
-- Re-runnable. No package or ORDS change: the existing
-- DELETE /events/:id -> gcode_events_api.delete_event keeps working, and this
-- trigger refuses the delete when it is not allowed.
--
-- Rule (same as the app, src/lib/event-delete.ts):
--   * DRAFT event: always deletable.
--   * Any other status: deletable only with 2 or fewer active registrations.
--
-- NOT enforced here: "admin only". The database never sees who is calling
-- (the API does not verify bearer tokens), so that part is checked in the app
-- (/my-organized-events is admin-only). If you later pass the caller's role to
-- delete_event, add the check in the trigger or the procedure.

CREATE OR REPLACE TRIGGER trg_events_delete_guard
BEFORE DELETE ON events
FOR EACH ROW
DECLARE
  c_max_regs CONSTANT PLS_INTEGER := 2;
  v_status   event_status.status_code%TYPE;
  v_regs     NUMBER;
BEGIN
  SELECT status_code INTO v_status
    FROM event_status WHERE id = :OLD.status_id;

  IF v_status <> 'DRAFT' THEN
    SELECT NVL(SUM(NVL(quantity, 1)), 0) INTO v_regs
      FROM gcode_event_participants
     WHERE event_id = :OLD.id AND active = 'Y';

    IF v_regs > c_max_regs THEN
      RAISE_APPLICATION_ERROR(-20401,
        'Event ' || :OLD.id || ' has ' || v_regs ||
        ' registrations. Only drafts or events with ' || c_max_regs ||
        ' or fewer registrations can be deleted. Cancel it instead.');
    END IF;
  END IF;
EXCEPTION
  WHEN NO_DATA_FOUND THEN NULL;  -- status row missing: treat like a draft
END;
/

-- Check it compiled (expect no rows):
SELECT name, line, text FROM user_errors WHERE name = 'TRG_EVENTS_DELETE_GUARD';

-- Revert:
-- DROP TRIGGER trg_events_delete_guard;
