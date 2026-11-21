import {
  createEventFromDraft as createOnServer,
  saveEventDraft,
  uploadCardImage,
  uploadCoverImage,
} from "@/lib/api/events";
import { EventDetailData } from "@/lib/zod/event";

// The editor's create and edit paths. The server saves the event and every
// child collection in one transaction (see events.write.service.ts); the
// only browser-side step left is uploading newly picked cover/card images.

export interface SaveResult {
  id: number | string;
  /** Non-fatal problems — the event itself was saved. */
  warnings: string[];
}

// A picked image only exists as a blob: preview URL until it's uploaded.
async function uploadPickedImages(
  id: number | string,
  data: EventDetailData,
  warnings: string[],
) {
  const picked = [
    { url: data.coverImageUrl, upload: uploadCoverImage, name: "cover image" },
    { url: data.cardImageUrl, upload: uploadCardImage, name: "card image" },
  ];
  for (const { url, upload, name } of picked) {
    if (!url.startsWith("blob:")) continue;
    try {
      const blob = await fetch(url).then((r) => r.blob());
      await upload(id, blob);
    } catch {
      warnings.push(`The ${name} couldn't be uploaded`);
    }
  }
}

export async function createEventFromDraft(
  data: EventDetailData,
  statusId: number | undefined,
): Promise<SaveResult> {
  const warnings: string[] = [];
  const { id } = await createOnServer(data, statusId);
  await uploadPickedImages(id, data, warnings);
  return { id, warnings };
}

export async function updateEventFromDraft(
  eventId: string,
  data: EventDetailData,
  statusId: number | undefined,
): Promise<SaveResult> {
  const warnings: string[] = [];
  await saveEventDraft(eventId, data, statusId);
  await uploadPickedImages(eventId, data, warnings);
  return { id: eventId, warnings };
}
