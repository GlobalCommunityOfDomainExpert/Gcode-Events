-- ONE-SHOT INSTALLER for the live-room join-link email.
-- Run this whole file as a script in APEX SQL Workshop > SQL Scripts (or SQL
-- Developer, F5). It adds send_join_link_email INSIDE the existing
-- GCODE_EMAIL_API package, so nothing has to be pasted by hand.
--
-- What it does:
--   1. Saves the current spec and body of GCODE_EMAIL_API into GCODE_PKG_BACKUP.
--   2. Reads the live source from USER_SOURCE and inserts the new declaration
--      (spec) and procedure (body) just before the final "END GCODE_EMAIL_API;".
--   3. Recompiles spec, then body. Stops with the compiler errors if any.
--   Safe to re-run: a part already installed is skipped.
--
-- Not covered here: the ORDS route. Run docs/sql/organizer-portal/02_rest.sql
-- afterwards (it creates portal_send_join_link).
--
-- Restore if anything looks wrong:
--   SELECT src FROM gcode_pkg_backup WHERE kind = 'PACKAGE BODY' ORDER BY saved_at DESC;
--   then run that text prefixed with CREATE OR REPLACE.
--
-- "[AMP]" below is "&": written this way so no tool treats it as a variable.

-- 0. Backup table --------------------------------------------------------------
BEGIN
  EXECUTE IMMEDIATE 'CREATE TABLE gcode_pkg_backup (
    name VARCHAR2(128), kind VARCHAR2(30), src CLOB, saved_at DATE DEFAULT SYSDATE)';
EXCEPTION WHEN OTHERS THEN
  IF SQLCODE != -955 THEN RAISE; END IF; -- already exists
END;
/

-- 1. Install -------------------------------------------------------------------
DECLARE
  c_pkg CONSTANT VARCHAR2(30) := 'GCODE_EMAIL_API';

  l_spec CLOB;
  l_body CLOB;
  l_snip_spec CLOB;
  l_snip_body CLOB;

  FUNCTION source_of(p_type VARCHAR2) RETURN CLOB IS
    l_c CLOB;
  BEGIN
    DBMS_LOB.CREATETEMPORARY(l_c, TRUE);
    FOR r IN (SELECT text FROM user_source
               WHERE name = c_pkg AND type = p_type ORDER BY line) LOOP
      DBMS_LOB.WRITEAPPEND(l_c, LENGTH(r.text), r.text);
    END LOOP;
    IF DBMS_LOB.GETLENGTH(l_c) = 0 THEN
      RAISE_APPLICATION_ERROR(-20001, p_type || ' ' || c_pkg || ' not found in this schema');
    END IF;
    RETURN l_c;
  END;

  -- Position of the LAST "END GCODE_EMAIL_API" (the package's closing line).
  FUNCTION last_end(p_src CLOB) RETURN NUMBER IS
    l_up  CLOB := UPPER(p_src);
    l_n   NUMBER := 0;
    l_pos NUMBER := 0;
    l_hit NUMBER;
  BEGIN
    LOOP
      l_n := l_n + 1;
      l_hit := DBMS_LOB.INSTR(l_up, 'END ' || c_pkg, 1, l_n);
      EXIT WHEN l_hit = 0;
      l_pos := l_hit;
    END LOOP;
    IF l_pos = 0 THEN
      RAISE_APPLICATION_ERROR(-20002, 'closing END ' || c_pkg || ' not found');
    END IF;
    RETURN l_pos;
  END;

  FUNCTION has_it(p_src CLOB) RETURN BOOLEAN IS
  BEGIN
    RETURN DBMS_LOB.INSTR(UPPER(p_src), 'SEND_JOIN_LINK_EMAIL') > 0;
  END;

  PROCEDURE insert_before_end(p_src IN OUT NOCOPY CLOB, p_snippet CLOB) IS
    l_pos NUMBER := last_end(p_src);
    l_new CLOB;
  BEGIN
    DBMS_LOB.CREATETEMPORARY(l_new, TRUE);
    IF l_pos > 1 THEN
      DBMS_LOB.COPY(l_new, p_src, l_pos - 1, 1, 1);
    END IF;
    DBMS_LOB.APPEND(l_new, p_snippet);
    DBMS_LOB.COPY(l_new, p_src, DBMS_LOB.GETLENGTH(p_src) - l_pos + 1,
                  DBMS_LOB.GETLENGTH(l_new) + 1, l_pos);
    p_src := l_new;
  END;

  PROCEDURE compile_it(p_type VARCHAR2, p_src CLOB) IS
    l_errs VARCHAR2(4000);
  BEGIN
    EXECUTE IMMEDIATE 'CREATE OR REPLACE ' || p_src;
    FOR e IN (SELECT line, position, text FROM user_errors
               WHERE name = c_pkg AND type = p_type ORDER BY sequence) LOOP
      l_errs := SUBSTR(l_errs || CHR(10) || e.line || ':' || e.position || ' ' || e.text, 1, 4000);
    END LOOP;
    IF l_errs IS NOT NULL THEN
      RAISE_APPLICATION_ERROR(-20003, p_type || ' did not compile:' || l_errs);
    END IF;
  END;
BEGIN
  l_spec := source_of('PACKAGE');
  l_body := source_of('PACKAGE BODY');

  INSERT INTO gcode_pkg_backup(name, kind, src) VALUES (c_pkg, 'PACKAGE', l_spec);
  INSERT INTO gcode_pkg_backup(name, kind, src) VALUES (c_pkg, 'PACKAGE BODY', l_body);
  COMMIT;

  l_snip_spec := q'~
  PROCEDURE send_join_link_email(
    p_event_id       IN NUMBER,
    p_participant_id IN NUMBER,
    p_join_url       IN VARCHAR2
  );

~';

  l_snip_body := q'~
  ----------------------------------------------------------------------------
  -- Live room join link. The link is signed by the Next.js server; this only
  -- looks up who it goes to and sends it.
  ----------------------------------------------------------------------------

  PROCEDURE send_join_link_email(
    p_event_id       IN NUMBER,
    p_participant_id IN NUMBER,
    p_join_url       IN VARCHAR2
  ) IS
    l_workspace_id NUMBER;
    l_from_email   VARCHAR2(128);
    l_body         CLOB;
    l_html         CLOB;
    l_content      CLOB;
    l_mail_id      NUMBER;
    v_email        gcode_users.email%TYPE;
    v_name         gcode_users.full_name%TYPE;
    v_title        events.title%TYPE;
    v_start        events.start_date%TYPE;
    v_when_date    VARCHAR2(100);
    v_when_time    VARCHAR2(100);
    v_url          VARCHAR2(1000);
  BEGIN
    -- Only an active registration of THIS event gets a link, sent to the
    -- address on that registration.
    BEGIN
      SELECT LOWER(u.email), u.full_name
        INTO v_email, v_name
        FROM gcode_event_participants p
        JOIN gcode_users u ON u.user_id = p.user_id
       WHERE p.id = p_participant_id
         AND p.event_id = p_event_id
         AND p.active = 'Y';
    EXCEPTION WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20404, 'No active registration ' || p_participant_id ||
                                      ' for event ' || p_event_id);
    END;

    SELECT title, start_date INTO v_title, v_start FROM events WHERE id = p_event_id;

    -- start_date is stored as UTC; the event is run on India time.
    IF v_start IS NOT NULL THEN
      v_when_date := TO_CHAR(FROM_TZ(CAST(v_start AS TIMESTAMP), 'UTC')
                             AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY');
      v_when_time := TO_CHAR(FROM_TZ(CAST(v_start AS TIMESTAMP), 'UTC')
                             AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') || ' IST';
    ELSE
      v_when_date := 'TBA';
      v_when_time := '';
    END IF;

    v_url := APEX_ESCAPE.HTML_ATTRIBUTE(p_join_url);

    l_content :=
    '<p class="body-p" style="margin:0 0 18px;font-size:15px;color:#222222;line-height:1.7;font-family:[AMP]quot;Segoe UI[AMP]quot;,Arial,sans-serif;">
      Dear <strong>' || APEX_ESCAPE.HTML(NVL(v_name, 'there')) || '</strong>,
    </p>
    <p class="body-p" style="margin:0 0 18px;font-size:15px;color:#444444;line-height:1.85;font-family:[AMP]quot;Segoe UI[AMP]quot;,Arial,sans-serif;">
      Here is your personal link to join <strong style="color:#111111;">' || APEX_ESCAPE.HTML(v_title) || '</strong>,
      organized by <strong><span style="color:#cc0000;">G</span>CODE</strong>. You do not need an account [AMP]mdash;
      this link is your ticket.
    </p>

    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 24px;background:#0d0d0d;border-radius:10px;">
    <tr>
    <td style="padding:24px 26px;text-align:center;">
      <p style="margin:0 0 6px;font-size:17px;font-weight:800;color:#ffffff;font-family:[AMP]quot;Segoe UI[AMP]quot;,Arial,sans-serif;">' || APEX_ESCAPE.HTML(v_title) || '</p>
      <p style="margin:0;font-size:13px;color:#cccccc;font-family:[AMP]quot;Segoe UI[AMP]quot;,Arial,sans-serif;">' || v_when_time || ' [AMP]nbsp;|[AMP]nbsp; ' || v_when_date || '</p>
    </td>
    </tr>
    </table>

    <div style="text-align:center;margin:0 0 28px;">
    <a href="' || v_url || '" style="display:inline-block;background:#cc0000;color:#ffffff;padding:16px 36px;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;font-family:[AMP]quot;Segoe UI[AMP]quot;,Arial,sans-serif;">
      Join the live session
    </a>
    </div>

    <p class="body-p" style="margin:0 0 18px;font-size:15px;color:#444444;line-height:1.85;font-family:[AMP]quot;Segoe UI[AMP]quot;,Arial,sans-serif;">
      The room opens 15 minutes before the start. Open the link then, allow your camera and microphone if asked, and
      you will be let in.
    </p>
    <p class="body-p" style="margin:0 0 32px;font-size:15px;color:#444444;line-height:1.85;font-family:[AMP]quot;Segoe UI[AMP]quot;,Arial,sans-serif;">
      This link is personal and works for one registration. Please do not share it.
    </p>';

    l_html := wrap_layout(
      p_page_title => 'GCODE Live Session Link',
      p_ref_line   => 'Reference: ' || v_title || ', ' || v_when_date,
      p_heading    => 'Your Link To Join<br/><span style="color:#cc0000;">The Live Session</span>',
      p_content    => l_content
    );

    SELECT workspace_id
      INTO l_workspace_id
      FROM apex_applications
     WHERE alias = 'GCODE'
     FETCH FIRST 1 ROWS ONLY;

    APEX_UTIL.SET_SECURITY_GROUP_ID(l_workspace_id);
    l_from_email := 'no-reply@gcode.in';

    l_body := 'Your link to join ' || v_title || ' (' || v_when_date || ' ' || v_when_time ||
              '): ' || p_join_url || ' . The room opens 15 minutes before the start. ' ||
              'This link is personal; please do not share it.';

    l_mail_id := APEX_MAIL.SEND(
      p_to        => v_email,
      p_from      => l_from_email,
      p_subj      => 'Your link to join ' || v_title,
      p_body      => l_body,
      p_body_html => l_html
    );

    APEX_MAIL.PUSH_QUEUE;
  END send_join_link_email;

~';

  l_snip_body := REPLACE(l_snip_body, '[AMP]', CHR(38));

  IF has_it(l_spec) THEN
    DBMS_OUTPUT.PUT_LINE('spec: already has send_join_link_email, skipped');
  ELSE
    insert_before_end(l_spec, l_snip_spec);
    compile_it('PACKAGE', l_spec);
    DBMS_OUTPUT.PUT_LINE('spec: installed');
  END IF;

  IF has_it(l_body) THEN
    DBMS_OUTPUT.PUT_LINE('body: already has send_join_link_email, skipped');
  ELSE
    insert_before_end(l_body, l_snip_body);
    compile_it('PACKAGE BODY', l_body);
    DBMS_OUTPUT.PUT_LINE('body: installed');
  END IF;
END;
/

-- 2. Check: expect "VALID" twice and no rows from the second query -------------
SELECT object_type, status FROM user_objects WHERE object_name = 'GCODE_EMAIL_API';
SELECT type, line, text FROM user_errors WHERE name = 'GCODE_EMAIL_API';

-- 3. Optional test: sends one real mail. Put a real, active registration of a
--    real event in, then run just this block (remove the leading "--").
-- BEGIN
--   gcode_email_api.send_join_link_email(
--     p_event_id       => 741,
--     p_participant_id => 0,  -- <- participant id from gcode_event_participants
--     p_join_url       => 'https://example.com/events/741/live?t=test'
--   );
-- END;
-- /
