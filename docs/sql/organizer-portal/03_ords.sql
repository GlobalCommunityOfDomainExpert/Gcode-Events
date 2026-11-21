-- Script 3 of 3: the REST routes. Run after 01_tables.sql and 02_packages.sql,
-- in WKSP_GCODE2. Every handler is one call into GCODE_EVENT_HTTP_API, which
-- identifies the caller from the Authorization header, so no handler takes a
-- user id from the request.
--
-- Existing modules are reused (templates are added; nothing is dropped). A
-- module is only created when it does not exist, so this is safe to re-run.
--
--   events     /events/:id/team | share-links | check-ins | communications
--              /events/:id/webinar | live-access | live/token | live/remove-person
--              /events/:id/live/:action  (go-live, stop, record, captions, notice, end)
--   team       /team/:id                 PUT, DELETE
--   share-links /share-links/:id         DELETE
--   shared     /shared/:token            GET (no side effects)
--              /shared/:token/open       POST (counts a view / activates an invite)
--              /shared/:token/data       GET (role-filtered; never contacts)
--   webhooks   /webhooks/live            POST (needs the WEBHOOK_SECRET header)
--
-- Not done here (set in ORDS / at the gateway): per-IP rate limiting on the
-- /shared routes. Nothing in this script is protected by an ORDS privilege,
-- matching the existing modules; access control lives in the packages.

DECLARE
  PROCEDURE ensure_module(p_name IN VARCHAR2, p_base IN VARCHAR2) IS
    v NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v FROM user_ords_modules WHERE name = p_name;
    IF v = 0 THEN
      ORDS.DEFINE_MODULE(p_module_name => p_name, p_base_path => p_base,
        p_items_per_page => 25, p_status => 'PUBLISHED', p_comments => NULL);
    END IF;
  END ensure_module;

  -- One route. p_header is the request header that carries the credential
  -- (bound as :authz, or :secret for the webhook).
  PROCEDURE route(p_module IN VARCHAR2, p_pattern IN VARCHAR2, p_method IN VARCHAR2,
                  p_source IN VARCHAR2, p_priority IN NUMBER DEFAULT 0,
                  p_header IN VARCHAR2 DEFAULT 'Authorization',
                  p_bind IN VARCHAR2 DEFAULT 'authz') IS
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => p_module, p_pattern => p_pattern,
      p_priority => p_priority, p_etag_type => 'HASH', p_etag_query => NULL, p_comments => NULL);
    ORDS.DEFINE_HANDLER(p_module_name => p_module, p_pattern => p_pattern,
      p_method => p_method, p_source_type => ORDS.source_type_plsql,
      p_mimes_allowed => NULL, p_comments => NULL, p_source => p_source);
    IF p_header IS NOT NULL THEN
      ORDS.DEFINE_PARAMETER(p_module_name => p_module, p_pattern => p_pattern,
        p_method => p_method, p_name => p_header, p_bind_variable_name => p_bind,
        p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN',
        p_comments => NULL);
    END IF;
  END route;
BEGIN
  ensure_module('gcode.events.v1', '/v1/events/');
  ensure_module('gcode.team.v1', '/v1/team/');
  ensure_module('gcode.share-links.v1', '/v1/share-links/');
  ensure_module('gcode.shared.v1', '/v1/shared/');
  ensure_module('gcode.webhooks.v1', '/v1/webhooks/');

  -- ------------------------------------------------------------ team
  route('gcode.events.v1', ':id/team', 'GET',
    q'[BEGIN gcode_event_http_api.h_team_list(:authz, :id); END;]');
  route('gcode.events.v1', ':id/team', 'POST',
    q'[BEGIN gcode_event_http_api.h_team_invite(:authz, :id, :email, :role); END;]');
  route('gcode.team.v1', ':id', 'PUT',
    q'[BEGIN gcode_event_http_api.h_team_role(:authz, :id, :role); END;]');
  route('gcode.team.v1', ':id', 'DELETE',
    q'[BEGIN gcode_event_http_api.h_team_remove(:authz, :id); END;]');

  -- ----------------------------------------------------- share links
  route('gcode.events.v1', ':id/share-links', 'GET',
    q'[BEGIN gcode_event_http_api.h_links_list(:authz, :id); END;]');
  route('gcode.events.v1', ':id/share-links', 'POST',
    q'[BEGIN gcode_event_http_api.h_links_create(:authz, :id, :label, :role, :expiry); END;]');
  route('gcode.share-links.v1', ':id', 'DELETE',
    q'[BEGIN gcode_event_http_api.h_links_revoke(:authz, :id); END;]');

  -- ------------------------------------------------------ shared view
  route('gcode.shared.v1', ':token', 'GET',
    q'[BEGIN gcode_event_http_api.h_shared_get(:token); END;]', 0, NULL);
  route('gcode.shared.v1', ':token/open', 'POST',
    q'[BEGIN gcode_event_http_api.h_shared_open(:authz, :token); END;]');
  route('gcode.shared.v1', ':token/data', 'GET',
    q'[BEGIN gcode_event_http_api.h_shared_data(:token); END;]', 0, NULL);

  -- ---------------------------------------------------------- check-in
  route('gcode.events.v1', ':id/check-ins', 'GET',
    q'[BEGIN gcode_event_http_api.h_checkins_list(:authz, :id, :token); END;]');
  route('gcode.events.v1', ':id/check-ins', 'POST',
    q'[BEGIN gcode_event_http_api.h_checkins_set(:authz, :id, :participant_id, :arrived, :token); END;]');

  -- --------------------------------------------------- communications
  route('gcode.events.v1', ':id/communications', 'GET',
    q'[BEGIN gcode_event_http_api.h_comm_list(:authz, :id); END;]');
  -- Body is read whole: a message can be long and participant_ids is an array.
  -- Any recipient_count the browser sends is never looked at.
  route('gcode.events.v1', ':id/communications', 'POST',
    q'[DECLARE
         v_subject VARCHAR2(200); v_group VARCHAR2(12); v_msg CLOB; v_ids CLOB;
       BEGIN
         SELECT JSON_VALUE(:body_text, '$.subject'),
                JSON_VALUE(:body_text, '$.recipient_group'),
                JSON_VALUE(:body_text, '$.message' RETURNING CLOB),
                JSON_QUERY(:body_text, '$.participant_ids' RETURNING CLOB)
           INTO v_subject, v_group, v_msg, v_ids
           FROM dual;
         gcode_event_http_api.h_comm_send(:authz, :id, v_subject, v_msg, v_group, v_ids);
       END;]');

  -- --------------------------------------------------------- live room
  route('gcode.events.v1', ':id/webinar', 'GET',
    q'[BEGIN gcode_event_http_api.h_webinar_get(:authz, :id); END;]');
  route('gcode.events.v1', ':id/webinar', 'PUT',
    q'[BEGIN
         gcode_event_http_api.h_webinar_put(:authz, :id, :audience, :recording, :chat,
           :hand_raise, :captions, :notice, :restream_url, :slides_url,
           :replay_published, :body_text);
       END;]');
  route('gcode.events.v1', ':id/live-access', 'GET',
    q'[BEGIN gcode_event_http_api.h_live_access(:authz, :id); END;]');
  -- Literal routes outrank :action, so token and remove-person get priority 1.
  route('gcode.events.v1', ':id/live/token', 'POST',
    q'[BEGIN gcode_event_http_api.h_live_token(:authz, :id); END;]', 1);
  route('gcode.events.v1', ':id/live/remove-person', 'POST',
    q'[BEGIN gcode_event_http_api.h_live_remove(:authz, :id, :registration_id); END;]', 1);
  route('gcode.events.v1', ':id/live/:action', 'POST',
    q'[BEGIN gcode_event_http_api.h_live_action(:authz, :id, :action, :enabled, :text); END;]');

  -- --------------------------------------------------------- webhooks
  -- Provider events arrive from a relay that has already verified the
  -- provider's signature. The relay sends the shared secret in this header.
  route('gcode.webhooks.v1', 'live', 'POST',
    q'[BEGIN
         gcode_event_http_api.h_webhook_live(:secret, :event_id, :provider_event_id,
           :kind, :participant_id, :recording_url);
       END;]', 0, 'X-Gcode-Webhook-Secret', 'secret');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
