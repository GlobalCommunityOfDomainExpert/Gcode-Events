// Maps API rows onto the UI's domain models (src/lib/event.ts, rounds.ts,
// attendees.ts) and builds request payloads from editor drafts — one file
// per domain. Import from "@/lib/api/adapters".
export { resolveImageUrl, formatDuration } from "./format";
export {
  DEFAULT_TERMS,
  DEFAULT_ELIGIBILITY,
  adaptTimelineItem,
  parseStages,
  adaptApiEvent,
} from "./event";
export {
  blankEventDetail,
  draftToPreviewDetail,
  toEventDraft,
} from "./event-draft";
export {
  attachAdvancedQuestionConfiguration,
  adaptEventQuestion,
} from "./questions";
export {
  adaptEventRound,
  adaptRoundDecision,
  adaptRoundScore,
  toRoundsDraft,
} from "./rounds";
export { adaptParticipant, adaptMyParticipation } from "./participants";
export { adaptEventPanelist, adaptPanelistInvite } from "./panelists";
export type { PanelistInvite } from "./panelists";
export { adaptCoupon, adaptUpiClaim } from "./payments";
