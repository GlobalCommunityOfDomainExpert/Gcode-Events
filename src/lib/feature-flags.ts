// Team & access ships behind a flag that defaults off (NEXT_PUBLIC_* is
// inlined at build time). The live room is always on.

/** Organizer portal extras: Team & access, share links. */
export const ORGANIZER_PORTAL_ENABLED =
  process.env.NEXT_PUBLIC_ORGANIZER_PORTAL === "true";
