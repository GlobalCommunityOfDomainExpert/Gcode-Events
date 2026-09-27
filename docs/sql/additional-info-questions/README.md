# Additional-info: audio audience + custom questions

Extends the additional-info page (`docs/sql/additional-info/` — audio, age
category, track submission, team member names) with:

1. **Audio recording gets its own audience.** `AUDIO_RECORDING_APPLIES_TO`
   (`ATTENDEE` or `PARTICIPANT`, default `PARTICIPANT`) replaces an earlier,
   never-shipped page-wide "applies to" switch — no combined "both" value,
   picked individually like everything else here.
2. **Organizer-authored custom questions.** Short-answer (`TEXT`),
   single-choice (`RADIO`) or multiple-choice (`CHECKBOX`), each with its
   own `APPLIES_TO` (`ATTENDEE` or `PARTICIPANT`) and an optional `REQUIRED`
   flag. In the wizard this is two checkbox-gated sections — "Ask Audience
   extra questions" and "Ask Participants extra questions" — each curating
   its own set; nothing shared between them.
3. Superseded, not removed: `AGE_CATEGORY_REQUIREMENT`,`TRACK_SUBMISSION_ENABLED`,
   `MEMBER_NAMES_ENABLED` stay on `EVENTS` (existing events may still hold
   that data) but the frontend no longer reads or writes them — an
   organizer who wants that today builds an equivalent custom question.

Run in this order in WKSP_GCODE2 (backup first; additive only):

1. `01_tables.sql` — the `AUDIO_RECORDING_APPLIES_TO` column + the three new
   tables (`GCODE_EVENT_QUESTIONS`, `GCODE_EVENT_QUESTION_OPTIONS`,
   `PARTICIPANT_QUESTION_ANSWERS`) + their indexes.
2. `02_package_patches.sql` — notes; real runnable package bodies are in
   `00_run_all_on_prod.sql`.
3. `03_ords_endpoints.md` — the new/changed routes.

`00_run_all_on_prod.sql` is the single consolidated script, assembled from
the real `GCODE-Backend` files (branch `feature/additional-info-questions`,
already committed and pushed there — this folder is the reference copy for
the cloud ADB deploy, same relationship as `docs/sql/event-interest/`).

Frontend: `src/app/(app)/(events)/my-organized-events/_components/step-additional-info.tsx`
(wizard), `src/app/(public)/events/[id]/additional-info/page.tsx` (public
page), `src/lib/api/events.ts` (`listEventQuestions`/`replaceEventQuestions`),
`src/lib/api/participants.ts` (`listParticipantAnswers`/`replaceParticipantAnswers`).

Known gaps:
- `REQUIRED` is client-side only, not enforced server-side (same as the
  rest of this page — e.g. the age-category `REQUIRED` label before it).
- Editing the question list is full delete-then-reinsert — see the cascade
  note in `02_package_patches.sql`.
