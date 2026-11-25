-- Event delete: guard trigger + purge procedure. Run in SQL Workshop > SQL Scripts
-- (schema WKSP_GCODE2). Re-runnable.
--
-- Why a procedure: EVENTS is referenced by tables with no cascade (Cashfree
-- orders, coupons, UPI claims, interest, ...), so a plain DELETE fails with
-- ORA-02292. gcode_purge_event finds those child tables from the data
-- dictionary and deletes their rows first (recursively), then the event.
--
-- Rules (the app applies the same ones, src/lib/event-delete.ts):
--   * DRAFT event: always purgeable. A draft is never public, so its orders
--     and registrations are test data.
--   * Other status: more than 2 registrations needs p_force = 'Y' (a verified
--     admin override, sent only by the Next.js server).
--   * Always refused: a live-money order (CF_ENV = 'PROD' and PROCESSING /
--     PAID / PAID_UNREGISTERED). That is a real payment record: cancel and
--     refund instead (ORA-20402).
-- Admin identity is checked in Next.js (verified JWT), not here.

CREATE OR REPLACE PROCEDURE gcode_purge_event (
  p_id    IN NUMBER,
  p_force IN VARCHAR2 DEFAULT 'N'
) AS
  c_max_regs CONSTANT PLS_INTEGER := 2;
  v_status   event_status.status_code%TYPE;
  v_regs     NUMBER;
  v_money    NUMBER;

  -- Delete every row that references the rows of p_table selected by p_where,
  -- deepest children first. NO ACTION and CASCADE foreign keys are both walked:
  -- a CASCADE child can have its own NO ACTION children (e.g. ADV_ANSWERS under
  -- ADV_OPTION_SETTINGS), and Oracle's cascade stops at those with ORA-02292.
  -- SET NULL keys never block and are left alone. Single-column keys only.
  PROCEDURE purge(p_table IN VARCHAR2, p_where IN VARCHAR2, p_depth IN PLS_INTEGER) IS
    v_child_where VARCHAR2(4000);
  BEGIN
    IF p_depth > 6 THEN
      RAISE_APPLICATION_ERROR(-20403, 'Foreign keys nest too deep under ' || p_table);
    END IF;
    FOR fk IN (
      SELECT c.table_name child, cc.column_name child_col, pc.column_name parent_col,
             (SELECT COUNT(*) FROM user_cons_columns x WHERE x.constraint_name = c.constraint_name) ncols
        FROM user_constraints c
        JOIN user_cons_columns cc ON cc.constraint_name = c.constraint_name
        JOIN user_constraints p   ON p.constraint_name = c.r_constraint_name
        JOIN user_cons_columns pc ON pc.constraint_name = p.constraint_name AND pc.position = cc.position
       WHERE c.constraint_type = 'R' AND c.delete_rule IN ('NO ACTION', 'CASCADE')
         AND p.table_name = p_table AND c.table_name <> p_table
    ) LOOP
      IF fk.ncols > 1 THEN
        RAISE_APPLICATION_ERROR(-20403, 'Composite foreign key on ' || fk.child || ' not handled');
      END IF;
      v_child_where := fk.child_col || ' IN (SELECT ' || fk.parent_col ||
                       ' FROM ' || p_table || ' WHERE ' || p_where || ')';
      purge(fk.child, v_child_where, p_depth + 1);
      EXECUTE IMMEDIATE 'DELETE FROM ' || fk.child || ' WHERE ' || v_child_where;
    END LOOP;
  END purge;
BEGIN
  BEGIN
    SELECT s.status_code INTO v_status
      FROM events e JOIN event_status s ON s.id = e.status_id WHERE e.id = p_id;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    RETURN;  -- nothing to delete
  END;

  -- Real money is never deleted.
  SELECT COUNT(*) INTO v_money FROM gcode_payment_orders_cf
   WHERE event_id = p_id AND cf_env = 'PROD'
     AND status IN ('PROCESSING', 'PAID', 'PAID_UNREGISTERED');
  IF v_money > 0 THEN
    RAISE_APPLICATION_ERROR(-20402,
      'Event ' || p_id || ' has ' || v_money ||
      ' live payment(s). Cancel and refund instead of deleting.');
  END IF;

  IF v_status <> 'DRAFT' THEN
    SELECT NVL(SUM(NVL(quantity, 1)), 0) INTO v_regs
      FROM gcode_event_participants WHERE event_id = p_id AND active = 'Y';
    IF v_regs > c_max_regs AND NVL(p_force, 'N') <> 'Y' THEN
      RAISE_APPLICATION_ERROR(-20401,
        'Event ' || p_id || ' has ' || v_regs || ' registrations; needs an admin override.');
    END IF;
  END IF;

  -- Tell the guard trigger this delete passed the checks above.
  DBMS_SESSION.SET_IDENTIFIER('GCODE_PURGE_EVENT');
  purge('EVENTS', 'id = ' || TO_CHAR(p_id), 1);
  DELETE FROM events WHERE id = p_id;
  DBMS_SESSION.CLEAR_IDENTIFIER;
EXCEPTION WHEN OTHERS THEN
  DBMS_SESSION.CLEAR_IDENTIFIER;
  RAISE;
END gcode_purge_event;
/

-- Guard for any other way of deleting an event (SQL Workshop, old scripts):
-- a non-draft event with more than 2 registrations cannot be deleted directly.
-- The purge procedure above has already checked and passes through.
CREATE OR REPLACE TRIGGER trg_events_delete_guard
BEFORE DELETE ON events
FOR EACH ROW
DECLARE
  c_max_regs CONSTANT PLS_INTEGER := 2;
  v_status   event_status.status_code%TYPE;
  v_regs     NUMBER;
BEGIN
  IF SYS_CONTEXT('USERENV', 'CLIENT_IDENTIFIER') = 'GCODE_PURGE_EVENT' THEN
    RETURN;
  END IF;
  SELECT status_code INTO v_status FROM event_status WHERE id = :OLD.status_id;
  IF v_status <> 'DRAFT' THEN
    SELECT NVL(SUM(NVL(quantity, 1)), 0) INTO v_regs
      FROM gcode_event_participants WHERE event_id = :OLD.id AND active = 'Y';
    IF v_regs > c_max_regs THEN
      RAISE_APPLICATION_ERROR(-20401,
        'Event ' || :OLD.id || ' has ' || v_regs ||
        ' registrations. Delete it from the app (admin only) or cancel it.');
    END IF;
  END IF;
EXCEPTION
  WHEN NO_DATA_FOUND THEN NULL;
END;
/

-- Both should compile with no rows:
SELECT name, type, line, text FROM user_errors
 WHERE name IN ('GCODE_PURGE_EVENT', 'TRG_EVENTS_DELETE_GUARD');

-- Revert: DROP PROCEDURE gcode_purge_event; DROP TRIGGER trg_events_delete_guard;
