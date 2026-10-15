# Event details enquiries

Adds `POST /events/:id/enquiries`. The endpoint validates the supplied email
and phone number, looks up the event title, and stores the request in
`GCODE_EVENT_ENQUIRIES` for follow-up. Email sending is disabled for now.

Run `00_run_on_prod.sql` in `WKSP_GCODE2`. The script creates the table and
index if missing, then creates or replaces the package and ORDS handler.

Review recent requests with:

```sql
SELECT id, event_id, event_title, email, phone, created_on
FROM GCODE_EVENT_ENQUIRIES
ORDER BY created_on DESC;
```

The request form uses the existing reusable modal, button, input, and
form-field components.
