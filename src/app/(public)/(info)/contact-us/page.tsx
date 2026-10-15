import type { Metadata } from "next";
import { InfoPage } from "../_components/info-page";

export const metadata: Metadata = {
  title: "Contact Us – GCODE Events",
  description:
    "Get help with event registration, payments, refunds and participation on GCODE Events.",
};

export default function ContactUsPage() {
  return (
    <InfoPage
      title="Contact Us"
      sections={[
        {
          blocks: [
            "Have a question about an event, registration, payment or participation? We're here to help.",
          ],
        },
        {
          heading: "GCODE Events Support",
          blocks: [
            "For assistance relating to:",
            [
              "Event registration",
              "Payment and transaction-related queries",
              "Refund requests",
              "Event participation",
              "Event access or joining instructions",
              "General platform queries",
              "Other event-related concerns",
            ],
            "please contact our support team.",
          ],
        },
        {
          heading: "Contact Information",
          blocks: [
            [
              "Email: [connect@gcode.in](mailto:connect@gcode.in)",
              "Website: [https://events.gcode.in](https://events.gcode.in)",
              "Operating Hours: Monday–Friday, 10:00 AM–6:00 PM IST",
            ],
            "For faster assistance regarding a particular event, please include the event name, registered email address and transaction/order ID (if applicable) in your communication.",
          ],
        },
      ]}
    />
  );
}
