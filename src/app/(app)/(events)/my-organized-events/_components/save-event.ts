import {
  createEventFromDraft as createOnServer,
  saveEventDraft,
  uploadCoverImage,
} from "@/lib/api/events";
import { EventDetailData } from "@/lib/zod/event";

// The editor's create and edit paths. The server saves the event and every
// child collection in one transaction (see events.write.service.ts); the
// only browser-side step left is uploading a newly picked cover.

export interface SaveResult {
  id: number | string;
  /** Non-fatal problems — the event itself was saved. */
  warnings: string[];
}

// A picked cover only exists as a blob: preview URL until it's uploaded.
async function uploadPickedCover(
  id: number | string,
  data: EventDetailData,
  warnings: string[],
) {
  if (!data.coverImageUrl.startsWith("blob:")) return;
  try {
    const blob = await fetch(data.coverImageUrl).then((r) => r.blob());
    await uploadCoverImage(id, blob);
  } catch {
    warnings.push("The cover image couldn't be uploaded");
  }
}

export async function createEventFromDraft(
  data: EventDetailData,
  statusId: number | undefined,
): Promise<SaveResult> {
  const warnings: string[] = [];
  const { id } = await createOnServer(data, statusId);
  await uploadPickedCover(id, data, warnings);
  return { id, warnings };
}

export async function updateEventFromDraft(
  eventId: string,
  data: EventDetailData,
  statusId: number | undefined,
): Promise<SaveResult> {
  const warnings: string[] = [];
  await saveEventDraft(eventId, data, statusId);
  await uploadPickedCover(eventId, data, warnings);
  return { id: eventId, warnings };
}
