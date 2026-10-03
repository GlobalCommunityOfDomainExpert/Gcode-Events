import type { Metadata } from "next";
import { InfoPage } from "../_components/info-page";

export const metadata: Metadata = {
  title: "Terms & Conditions – GCODE Events",
  description:
    "The terms that apply when you use GCODE Events, register for an event or purchase a ticket.",
};

export default function TermsAndConditionsPage() {
  return (
    <InfoPage
      title="Terms & Conditions"
      lastUpdated="03 October 2026"
      sections={[
        {
          blocks: [
            "Welcome to GCODE Events. By accessing or using [https://events.gcode.in](https://events.gcode.in), registering for an event or purchasing an event ticket, you agree to these Terms & Conditions.",
            "If you do not agree with these terms, please do not use the platform or register for an event.",
          ],
        },
        {
          heading: "1. About the Platform",
          blocks: [
            "GCODE Events provides an online platform through which users can discover and register for events including hackathons, ideathons, webinars, expert AMAs, workshops and other community or learning activities.",
            "GCODE Events is operated by Gig Eco Marketplace Private Limited.",
          ],
        },
        {
          heading: "2. Event Registration",
          blocks: [
            "When registering for an event, you agree to provide accurate and complete information.",
            "You are responsible for ensuring that the information provided during registration is correct.",
            "Certain events may have eligibility criteria, capacity limits, age requirements or other participation conditions. These requirements will be communicated on the relevant event page where applicable.",
          ],
        },
        {
          heading: "3. Event Information",
          blocks: [
            "Event dates, timings, speakers, venues, formats, eligibility requirements and other details may be subject to change.",
            "We may update event information when necessary and will make reasonable efforts to communicate material changes to registered participants.",
          ],
        },
        {
          heading: "4. Paid Events",
          blocks: [
            "Certain events may require payment of a registration or participation fee.",
            "The applicable fee will be displayed before completing the registration/payment process.",
            "Payment confirmation does not necessarily guarantee eligibility where an event has separate eligibility requirements.",
          ],
        },
        {
          heading: "5. User Responsibilities",
          blocks: [
            "Users agree not to:",
            [
              "Provide false or misleading information",
              "Use the platform for unlawful purposes",
              "Attempt to interfere with or compromise the platform",
              "Misuse event registration systems",
              "Engage in abusive, threatening or disruptive behaviour",
              "Attempt to gain unauthorised access to accounts or systems",
              "Use the platform to distribute malicious content",
            ],
          ],
        },
        {
          heading: "6. Event Participation",
          blocks: [
            "Participants are expected to comply with applicable event rules and reasonable instructions from event organisers.",
            "An organiser may restrict or remove participation where a participant violates applicable event rules, creates a safety or security concern, or engages in disruptive or prohibited conduct.",
          ],
        },
        {
          heading: "7. Intellectual Property",
          blocks: [
            "Unless otherwise stated, content available on the GCODE Events platform, including its branding, website content, graphics, text and platform materials, is owned by or licensed to the platform operator.",
            "Event-specific content may belong to the respective event organisers, speakers or other rights holders.",
            "You may not reproduce or commercially exploit platform content without appropriate permission.",
          ],
        },
        {
          heading: "8. Third-Party Services",
          blocks: [
            "The platform may use third-party services for payment processing, communications, hosting, analytics or other functionality.",
            "Use of those services may be subject to the relevant third party's terms and policies.",
          ],
        },
        {
          heading: "9. Payments and Refunds",
          blocks: [
            "Payments are subject to the applicable payment and refund terms displayed for the relevant event and our [Refund & Cancellation Policy](/refund-policy).",
          ],
        },
        {
          heading: "10. Platform Availability",
          blocks: [
            "We aim to keep the platform available and functional but do not guarantee uninterrupted or error-free availability.",
            "Maintenance, technical problems, security incidents or circumstances outside our reasonable control may temporarily affect availability.",
          ],
        },
        {
          heading: "11. Changes to Events",
          blocks: [
            "GCODE Events or an event organiser may modify, postpone or cancel an event where reasonably necessary.",
            "Where a material change occurs, reasonable efforts will be made to communicate the change to affected participants.",
          ],
        },
        {
          heading: "12. Limitation",
          blocks: [
            "To the extent permitted by applicable law, GCODE Events and the platform operator will not be responsible for losses arising solely from circumstances beyond reasonable control, including technical failures, third-party service interruptions, network failures or event changes caused by external circumstances.",
            "Nothing in these Terms excludes rights or liabilities that cannot legally be excluded.",
          ],
        },
        {
          heading: "13. Privacy",
          blocks: [
            "Information collected through the platform is handled in accordance with our [Privacy Policy](/privacy-policy).",
          ],
        },
        {
          heading: "14. Changes to These Terms",
          blocks: [
            "We may update these Terms & Conditions from time to time. Updated terms will be published on this page.",
          ],
        },
      ]}
    />
  );
}
