// GCODE's closing "ethos" block on the event page. One ethos per *category*,
// worded generically so it fits every sub-type in it (the Culture ethos has
// to read right for a talent show, an art exhibition, a comedy night and a
// food fest alike). Picked automatically by keyword from the event type name
// — it comes from a backend lookup table, so new types land in the right
// category without code changes. Unknown types get Community.

export interface EventEthos {
  category: string; // internal name, handy for debugging/tests
  label: string; // small caps line next to the logo
  motto: string; // the bold one-liner
  paragraphs: string[];
}

// Performances, arts, culture and celebrations.
const CULTURE: EventEthos = {
  category: "culture",
  label: "The GCODE Culture Ethos",
  motto: "Create. Express. Celebrate. Belong.",
  paragraphs: [
    "At GCODE, we believe every community is richer for its culture. Whether you're on stage, behind the scenes or in the crowd, every gathering is a chance to express yourself, discover new voices and celebrate what makes us who we are.",
    "We give creators and audiences a welcoming, well-run space — a fair platform to be seen and heard, recognition for the work, and a room full of people who share the passion.",
    "Because at GCODE, the moment doesn't end when the lights go down — it's where new connections and opportunities begin.",
  ],
};

// Hackathons, buildathons, game jams, coding contests — making things to a deadline.
const BUILD: EventEthos = {
  category: "build",
  label: "The GCODE Builder Ethos",
  motto: "Build. Ship. Learn. Repeat.",
  paragraphs: [
    "At GCODE, we believe the best way to learn is to make something real. Every build challenge turns ideas into working things against the clock — and every team is a chance to learn from people who think differently.",
    "We bring together makers of every kind, give them mentors, tools and a clear problem, and get out of the way. What you finish matters less than what you learn finishing it.",
    "Because at GCODE, the final demo isn't the finish line — it's the first version.",
  ],
};

// Ideathons, pitch competitions, case challenges, innovation challenges.
const IDEAS: EventEthos = {
  category: "ideas",
  label: "The GCODE Ideas Ethos",
  motto: "Question. Imagine. Pitch. Change.",
  paragraphs: [
    "At GCODE, we believe good ideas can come from anyone — no code, no degree, no title required. Every challenge is a room where people from different walks of life can work on the same problem together.",
    "We help you sharpen a raw idea into a clear problem, a realistic plan and a pitch people can act on — and connect the strongest ones with the mentors and partners who can carry them forward.",
    "Because at GCODE, an idea isn't finished when it's presented — it's finished when it's real.",
  ],
};

// Workshops, bootcamps, masterclasses, courses — hands-on learning.
const LEARN: EventEthos = {
  category: "learn",
  label: "The GCODE Learning Ethos",
  motto: "Learn. Practice. Apply. Share.",
  paragraphs: [
    "At GCODE, we believe learning sticks when you do it yourself. Every session is built around practice, not just slides — you leave with skills you've tried, not only notes you've taken.",
    "Our instructors are practitioners who use what they teach. Ask the awkward questions, make mistakes safely, and learn alongside people at the same stage as you.",
    "Because at GCODE, learning doesn't end when the session does — it starts when you put it to use.",
  ],
};

// Webinars, talks, AMAs, panels, conferences — learning by listening.
const INSIGHT: EventEthos = {
  category: "insight",
  label: "The GCODE Insight Ethos",
  motto: "Listen. Ask. Think. Apply.",
  paragraphs: [
    "At GCODE, we believe experience is worth more when it's shared. Every session is a chance to hear how people actually solve problems — the trade-offs, the mistakes and what they'd do differently.",
    "We bring you speakers who've done the work and keep room for your questions, so you leave with answers to your problems, not just theirs.",
    "Because at GCODE, a good session doesn't end when it's over — it changes what you do next.",
  ],
};

// Meetups, networking, mixers, socials, community gatherings.
const COMMUNITY: EventEthos = {
  category: "community",
  label: "The GCODE Community Ethos",
  motto: "Meet. Share. Help. Grow.",
  paragraphs: [
    "At GCODE, we believe the right conversation can change what happens next. Every gathering is a room full of people building, learning, hiring and looking for someone to work with.",
    "We keep things open enough to welcome newcomers and small enough to really talk — everyone on the same footing, whatever their title or experience.",
    "Because at GCODE, community isn't a network you collect — it's people you show up for.",
  ],
};

// Charity, fundraisers, volunteering, drives — events for a cause.
const CAUSE: EventEthos = {
  category: "cause",
  label: "The GCODE Giving Ethos",
  motto: "Show up. Give back. Lift others.",
  paragraphs: [
    "At GCODE, we believe a community is measured by what it gives. Every event for a cause turns time, skills and goodwill into something that helps people beyond the room.",
    "We keep it transparent — you'll know where your support goes and what it made possible.",
    "Because at GCODE, success means more when it's shared.",
  ],
};

// Sports, games, tournaments, races — competing in the open.
const PLAY: EventEthos = {
  category: "play",
  label: "The GCODE Sporting Ethos",
  motto: "Play. Compete. Respect. Improve.",
  paragraphs: [
    "At GCODE, we believe competition brings out the best in people when it's played fair. Every match is a chance to test yourself, push your limits and earn the respect of the people across from you.",
    "We run events that are organised, safe and open to all levels — so the focus stays on the game and the people playing it.",
    "Because at GCODE, the result fades — the friendships and the improvement stay.",
  ],
};

// First matching rule wins — specific categories before broad ones.
const RULES: [RegExp, EventEthos][] = [
  [/hack|buildathon|game jam|coding|code|devfest|olympiad/i, BUILD],
  [/idea|pitch|innovat|\bcase\b|startup challenge|competition/i, IDEAS],
  [/workshop|bootcamp|course|training|class|\blab\b|clinic/i, LEARN],
  [
    /webinar|talk|\bama\b|seminar|conference|summit|panel|lecture|keynote|fireside/i,
    INSIGHT,
  ],
  [
    /cultur|talent|music|concert|open mic|fest|\bart|exhibit|dance|comedy|theat|drama|film|cinema|poetry|food|perform/i,
    CULTURE,
  ],
  [/charit|fundrais|volunteer|cause|donat|drive|\bngo\b/i, CAUSE],
  [
    /sport|tournament|league|marathon|\brun\b|race|cricket|football|chess|esport|game/i,
    PLAY,
  ],
  [/network|meetup|community|mixer|social|founder|gathering|club/i, COMMUNITY],
];

export function ethosFor(type: string | undefined): EventEthos {
  const name = type ?? "";
  return RULES.find(([re]) => re.test(name))?.[1] ?? COMMUNITY;
}
