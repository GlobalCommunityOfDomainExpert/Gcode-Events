import type { Metadata } from "next";
import { InfoPage } from "../_components/info-page";

export const metadata: Metadata = {
  title: "About Us – GCODE Events",
  description:
    "GCODE Events is a community-driven platform for learning and networking through hackathons, ideathons, AMAs, webinars and workshops.",
};

export default function AboutUsPage() {
  return (
    <InfoPage
      title="About GCODE Events"
      sections={[
        {
          blocks: [
            "GCODE Events is a community-driven platform designed to help students, professionals, founders, entrepreneurs, technology enthusiasts and industry experts discover and participate in meaningful learning and networking opportunities.",
            "The platform brings together events such as hackathons, ideathons, expert AMAs, webinars, workshops and community sessions, providing participants with opportunities to learn from practitioners, solve real-world problems, exchange ideas and build professional connections.",
            "Our objective is to make high-quality knowledge, expertise and collaborative opportunities more accessible through structured events and community-led experiences.",
            "GCODE Events may host both free and paid events, depending on the organiser, event format and services associated with a particular event. Specific event details, participation requirements, fees and applicable conditions are displayed on the respective event page.",
          ],
        },
        {
          heading: "Our Community",
          blocks: [
            "We aim to build an environment where participants can:",
            [
              "Learn from industry professionals and subject-matter experts",
              "Participate in practical challenges and hackathons",
              "Exchange ideas with entrepreneurs and fellow professionals",
              "Discover new technologies, opportunities and perspectives",
              "Build meaningful professional and community connections",
            ],
          ],
        },
        {
          heading: "Platform Operator",
          blocks: [
            "GCODE Events is operated by Gig Eco Marketplace Private Limited.",
            "For questions regarding the platform, events or participation, please contact us through the [Contact Us](/contact-us) page.",
          ],
        },
      ]}
    />
  );
}
