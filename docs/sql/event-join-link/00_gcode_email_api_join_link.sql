-- Join-link email for the live room, added INSIDE the existing GCODE_EMAIL_API.
-- Two pieces to paste into the package (SQL Workshop > Object Browser > Packages,
-- or edit the source in SQL Developer). Do NOT run this file as a script: it is
-- two snippets, shown so they can be pasted into the right place.
--
-- Why: a guest registers by email code, has no password and never signs in, so
-- the server cannot tell who they are at the live-room door. This email carries a
-- personal, signed link (made by the Next.js server, never here) that proves
-- which registration is joining. The recipient is read from the registration in
-- this procedure, never taken from the caller.
--
-- Order matters: change the SPEC first, then the BODY.

-- =============================================================================
-- 1. PACKAGE SPEC: add this declaration before the final "END GCODE_EMAIL_API;"
-- =============================================================================
--
--   PROCEDURE send_join_link_email(
--     p_event_id       IN NUMBER,
--     p_participant_id IN NUMBER,
--     p_join_url       IN VARCHAR2
--   );
--

-- =============================================================================
-- 2. PACKAGE BODY: paste this procedure just before the final
--    "END GCODE_EMAIL_API;" (it uses the package's own wrap_layout, which is
--    defined earlier in the body, so the mail looks like every other GCODE mail).
-- =============================================================================

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
    '<p class="body-p" style="margin:0 0 18px;font-size:15px;color:#222222;line-height:1.7;font-family:&quot;Segoe UI&quot;,Arial,sans-serif;">
      Dear <strong>' || APEX_ESCAPE.HTML(NVL(v_name, 'there')) || '</strong>,
    </p>
    <p class="body-p" style="margin:0 0 18px;font-size:15px;color:#444444;line-height:1.85;font-family:&quot;Segoe UI&quot;,Arial,sans-serif;">
      Here is your personal link to join <strong style="color:#111111;">' || APEX_ESCAPE.HTML(v_title) || '</strong>,
      organized by <strong><span style="color:#cc0000;">G</span>CODE</strong>. You do not need an account &mdash;
      this link is your ticket.
    </p>

    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 24px;background:#0d0d0d;border-radius:10px;">
    <tr>
    <td style="padding:24px 26px;text-align:center;">
      <p style="margin:0 0 6px;font-size:17px;font-weight:800;color:#ffffff;font-family:&quot;Segoe UI&quot;,Arial,sans-serif;">' || APEX_ESCAPE.HTML(v_title) || '</p>
      <p style="margin:0;font-size:13px;color:#cccccc;font-family:&quot;Segoe UI&quot;,Arial,sans-serif;">' || v_when_time || ' &nbsp;|&nbsp; ' || v_when_date || '</p>
    </td>
    </tr>
    </table>

    <div style="text-align:center;margin:0 0 28px;">
    <a href="' || v_url || '" style="display:inline-block;background:#cc0000;color:#ffffff;padding:16px 36px;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;font-family:&quot;Segoe UI&quot;,Arial,sans-serif;">
      Join the live session
    </a>
    </div>

    <p class="body-p" style="margin:0 0 18px;font-size:15px;color:#444444;line-height:1.85;font-family:&quot;Segoe UI&quot;,Arial,sans-serif;">
      The room opens 15 minutes before the start. Open the link then, allow your camera and microphone if asked, and
      you will be let in.
    </p>
    <p class="body-p" style="margin:0 0 32px;font-size:15px;color:#444444;line-height:1.85;font-family:&quot;Segoe UI&quot;,Arial,sans-serif;">
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

-- =============================================================================
-- Check after compiling the spec and the body (expect no rows):
--   SELECT name, type, line, text FROM user_errors WHERE name = 'GCODE_EMAIL_API';
-- Other packages that call GCODE_EMAIL_API recompile on their own the next time
-- they run; if one shows INVALID, run: ALTER PACKAGE <name> COMPILE BODY;
-- =============================================================================
