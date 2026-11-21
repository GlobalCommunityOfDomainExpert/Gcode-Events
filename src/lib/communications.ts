export interface CommunicationLog {
  id: string;
  eventId: string;
  subject: string;
  message: string;
  sentAt: string;
  /** Counted by the server from the resolved recipients. */
  recipientCount: number;
  status?: "QUEUED" | "SENT" | "FAILED";
}

export type RecipientGroup = "ALL" | "CONFIRMED" | "PAID" | "CUSTOM";
