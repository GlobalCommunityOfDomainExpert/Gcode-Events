import type { Metadata } from "next";
import { InfoPage } from "../_components/info-page";

export const metadata: Metadata = {
  title: "Privacy Policy – GCODE Events",
  description: "How GCODE Events collects, uses and protects your information.",
};

export default function PrivacyPolicyPage() {
  return (
    <InfoPage
      title="Privacy Policy"
      lastUpdated="03 October 2026"
      sections={[
        {
          blocks: [
            'GCODE Events ("GCODE Events", "we", "us" or "our") respects your privacy and is committed to protecting the information you provide while using our website and participating in our events.',
            "This Privacy Policy explains what information we collect, how we use it and the choices available to you when you use [https://events.gcode.in](https://events.gcode.in).",
          ],
        },
        {
          heading: "1. Information We Collect",
          blocks: [
            "Depending on how you use the platform, we may collect information such as:",
            [
              "Name",
              "Email address",
              "Phone number",
              "Organisation, college or professional information",
              "Event registration information",
              "Payment and transaction information",
              "Information submitted through forms",
              "Communication and support requests",
              "Information relating to your participation in an event",
            ],
            "We may also automatically collect limited technical information such as browser type, device information, IP address and website usage information for security, analytics and service improvement.",
          ],
        },
        {
          heading: "2. Payment Information",
          blocks: [
            "Payments for paid events may be processed through third-party payment service providers.",
            "GCODE Events does not intend to store complete card, UPI or banking credentials on its own systems. Payment information may be processed directly by the applicable payment service provider in accordance with its privacy and security practices.",
          ],
        },
        {
          heading: "3. How We Use Information",
          blocks: [
            "We may use collected information to:",
            [
              "Register you for events",
              "Process and confirm payments",
              "Provide event-related communications",
              "Send joining instructions and updates",
              "Respond to customer-support requests",
              "Process refunds where applicable",
              "Maintain platform security",
              "Prevent fraudulent or unauthorised activity",
              "Improve our events and platform",
              "Meet applicable legal and regulatory requirements",
            ],
          ],
        },
        {
          heading: "4. Event Communications",
          blocks: [
            "When you register for an event, we may send communications necessary to administer that event, including registration confirmations, payment confirmations, schedule changes, access instructions and other important event information.",
          ],
        },
        {
          heading: "5. Sharing of Information",
          blocks: [
            "We may share relevant information with service providers who help us operate the platform, process payments, communicate with participants, provide event services or maintain our technology infrastructure.",
            "We may also disclose information where required by applicable law, regulation, legal process or governmental authority.",
            "We do not intend to sell personal information to third parties.",
          ],
        },
        {
          heading: "6. Data Security",
          blocks: [
            "We use reasonable technical and organisational measures designed to protect information against unauthorised access, alteration, disclosure or destruction.",
            "However, no internet-based service can guarantee absolute security.",
          ],
        },
        {
          heading: "7. Third-Party Services",
          blocks: [
            "Our platform may use third-party services for functions such as payment processing, analytics, communications, hosting and other infrastructure.",
            "Your use of such services may also be subject to the privacy policies of those providers.",
          ],
        },
        {
          heading: "8. Cookies",
          blocks: [
            "The website may use cookies or similar technologies to maintain functionality, understand website usage and improve the user experience.",
            "You may be able to control cookies through your browser settings.",
          ],
        },
        {
          heading: "9. Data Retention",
          blocks: [
            "We retain information for as long as reasonably necessary for the purposes described in this policy, including providing services, maintaining records, resolving disputes and complying with applicable legal obligations.",
          ],
        },
        {
          heading: "10. Your Rights",
          blocks: [
            "Subject to applicable law, you may request access to, correction of or deletion of certain personal information held by us.",
            "To make a privacy-related request, contact us using the details provided on our [Contact Us](/contact-us) page.",
          ],
        },
        {
          heading: "11. Children's Privacy",
          blocks: [
            "Our events may have specific age or eligibility requirements. Where an event is intended for a particular age group, the applicable event-specific requirements will apply.",
            "We do not knowingly collect personal information from children in circumstances where collection is prohibited by applicable law.",
          ],
        },
        {
          heading: "12. Changes to This Policy",
          blocks: [
            'We may update this Privacy Policy from time to time. The updated version will be published on this page with the revised "Last Updated" date.',
          ],
        },
      ]}
    />
  );
}
