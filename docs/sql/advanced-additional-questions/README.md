# Advanced Additional Questions

This deployment adds storage and ORDS routes for recursive advanced-question choices and answers. It does not add columns to or change the existing event, question, option, participant-answer, or participant tables. Existing `/questions` and `/answers` routes remain in use for the base form.

## What the new objects do

- `GCODE_EVENT_ADV_Q_SETTINGS`: stores the on/off switch for an event.
- `GCODE_EVENT_ADV_OPTION_SETTINGS`: stores whether a selected choice opens another level, whether that level is required, and whether a root checkbox question supports “Other”. A parent choice ID links each nested level.
- `GCODE_EVENT_ADV_OPTIONS`: stores choices at every follow-up level.
- `GCODE_EVENT_ADV_ANSWERS`: stores each participant selection in the chain or their “Other” text.
- `GCODE_EVENT_ADV_Q_API`: writes only to those new tables. It reads existing questions and answers where needed to check IDs and selections.

The organizer save flow uses the existing route for base questions only when those questions actually changed. For an advanced-enabled event with registrations, the frontend blocks question changes because that existing route recreates questions and could remove submitted answers. Unrelated event edits do not rewrite unchanged questions. Recursive settings and choices are saved through the new `advanced-question-tree` route. Its related read routes use the `advanced-question-tree-settings` and `advanced-question-tree-options` names; the feature switch and participant answers have their own new route names as well.

On participant submission, ordinary answers use the existing answers route and follow-up answers use the new advanced-answers route. These are separate requests. If the first succeeds and the second fails, ordinary answers are saved, advanced answers may not be, and the participant sees an error and can retry. The event registration itself remains in place.

## Deployment

`00_run_on_prod.sql` is the fresh-install script. In the current `WKSP_GCODE2` run, the first-generation tables already existed, so the table creation statements failed and the package body did not compile. Do not run that file again against this schema. Use `01_repair_recursive_install.sql` to add the two missing parent-choice columns, replace the old uniqueness rule, and recompile the package while retaining existing rows. It also redefines the feature's new ORDS routes.

Run the repair file with **SQL Scripts → Run Script** in `WKSP_GCODE2`; do not paste the whole file into SQL Commands. After it completes, confirm `GCODE_EVENT_ADV_Q_API` is `VALID` and `USER_ERRORS` has no errors for it before using the frontend. The repair script has not been executed against Oracle from this workspace, so its compile result must be confirmed in APEX. DDL applies as each statement runs, so a later error does not undo earlier table changes.

It does not migrate or backfill existing event data. Leave the feature off for existing events; enable it only for the event where you intend to use it.
