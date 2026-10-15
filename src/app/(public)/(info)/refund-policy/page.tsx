import type { Metadata } from "next";
import { InfoPage } from "../_components/info-page";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy – GCODE Events",
  description:
    "Refund and cancellation terms for registrations and payments made through GCODE Events.",
};

export default function RefundPolicyPage() {
  return (
    <InfoPage
      title="Refund & Cancellation Policy"
      lastUpdated="03 October 2026"
      sections={[
        {
          blocks: [
            "This Refund & Cancellation Policy applies to registrations and payments made through GCODE Events.",
            "Because events may have different organisers, formats and participation requirements, the refund terms applicable to a particular event may also be specified on its event page.",
          ],
        },
        {
          heading: "1. Event Cancellation by GCODE Events or Organiser",
          blocks: [
            "If an event is cancelled by GCODE Events or the applicable event organiser, registered participants may be eligible for a refund of the event registration fee.",
            "Where applicable, the refund will be processed to the original payment method used for the transaction.",
          ],
        },
        {
          heading: "2. Event Rescheduling",
          blocks: [
            "If an event is rescheduled, the registration may remain valid for the rescheduled event.",
            "Where a refund option is offered because of the rescheduling, the applicable instructions and timeline will be communicated to registered participants.",
          ],
        },
        {
          heading: "3. Participant Cancellation",
          blocks: [
            "Refund eligibility for participant-initiated cancellation depends on the specific event's cancellation terms.",
            "Where an event-specific refund deadline is provided on the event page, that deadline will apply.",
            "If no event-specific cancellation terms are provided, refund requests may be submitted through our [Contact Us](/contact-us) page and will be reviewed based on the circumstances and applicable event terms.",
          ],
        },
        {
          heading: "4. Non-Refundable Registrations",
          blocks: [
            "Certain event registrations, tickets, workshops or services may be explicitly marked as non-refundable before payment.",
            "Where a registration is identified as non-refundable, the participant will not ordinarily be eligible for a refund except where required by applicable law or where the event is cancelled or otherwise qualifies for a refund under the applicable terms.",
          ],
        },
        {
          heading: "5. Duplicate or Erroneous Payments",
          blocks: [
            "If you believe you have made a duplicate payment or were charged incorrectly, please contact us with:",
            [
              "Name",
              "Registered email address",
              "Event name",
              "Transaction/order ID",
              "Date of transaction",
              "Relevant payment details or evidence",
            ],
            "We will investigate the transaction and take appropriate action.",
          ],
        },
        {
          heading: "6. Refund Processing",
          blocks: [
            "Once a refund is approved, the refund will generally be initiated to the original payment method.",
            "The time taken for the amount to appear in your account may depend on the payment gateway, bank or payment method used.",
          ],
        },
        {
          heading: "7. How to Request a Refund",
          blocks: [
            "Send your refund request to:",
            ["Email: [connect@gcode.in](mailto:connect@gcode.in)"],
            "Please include the event name and transaction/order ID.",
          ],
        },
        {
          heading: "8. Event-Specific Terms",
          blocks: [
            "Where an event page contains specific cancellation, refund or ticketing conditions, those conditions will apply to the relevant event.",
          ],
        },
      ]}
    />
  );
}
