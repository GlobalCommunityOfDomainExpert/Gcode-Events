"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button, Card, Icon } from "@/components/atoms";
import { Banner, Modal, Step, StepIndicator } from "@/components/molecules";
import { useWizardStore } from "@/lib/store/wizard-store";
import { useLookup } from "@/hooks/use-lookup";

import { StepEventType } from "./step-event-type";
import { StepDetails } from "./step-details";
import { StepRegistration } from "./step-registration";
import { StepScheduleMode } from "./step-schedule-mode";
import { StepTimelineLinks } from "./step-timeline-links";
import { StepRounds } from "./step-rounds";
import { StepAdditionalInfo } from "./step-additional-info";
import { StepTerms } from "./step-terms";
import { StepReview } from "@/app/(app)/(events)/my-organized-events/_components/step-review";
import { EventDetailData, initialEventData } from "@/lib/zod/event";
import {
  createEvent,
  updateEvent,
  replaceEventSocialLinks,
  replaceEventMedia,
  replaceEventTimeline,
  uploadCoverImage,
  assignCategory,
  removeCategory,
} from "@/lib/api/events";
import { replaceEventRounds } from "@/lib/api/rounds";
import { ApiError } from "@/lib/api/client";
import { getStatuses } from "@/lib/api/lookups";
import {
  toCreatePayload,
  toTimelinePayload,
  toRoundsPayload,
} from "@/lib/api/adapters";

const stepLabels = [
  "Type",
  "Details",
  "Registration & Passes",
  "Schedule & Mode",
  "Timeline & Media",
  "Rounds",
  "Additional Info",
  "Terms",
  "Review",
];

export interface EventWizardProps {
  mode: "create" | "edit";
  eventId?: string;
  initialData?: EventDetailData;
}

export function EventWizard({ mode, eventId, initialData }: EventWizardProps) {
  const router = useRouter();

  const stepIndex = useWizardStore((state) => state.stepIndex);
  const data = useWizardStore((state) => state.data);
  const submitting = useWizardStore((state) => state.submitting);
  const setStepIndex = useWizardStore((state) => state.setStep);
  const update = useWizardStore((state) => state.update);
  const setSubmitting = useWizardStore((state) => state.setSubmitting);
  const resetWizard = useWizardStore((state) => state.reset);

  const { data: statuses } = useLookup(getStatuses);
  const draftStatusId = statuses.find((s) => s.status_code === "DRAFT")?.id;
  const openStatusId = statuses.find((s) => s.status_code === "OPEN")?.id;

  const [pendingAction, setPendingAction] = useState<
    "draft" | "publish" | null
  >(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    resetWizard(mode === "edit" ? initialData : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, eventId]);

  const baselineData =
    mode === "edit" && initialData ? initialData : initialEventData;
  const isDirty = JSON.stringify(data) !== JSON.stringify(baselineData);

  const cancelHref =
    mode === "edit"
      ? `/my-organized-events/${eventId}`
      : "/my-organized-events";

  function handleCancelClick() {
    if (isDirty) {
      setShowCancelConfirm(true);
    } else {
      router.push(cancelHref);
    }
  }

  const steps: Step[] = stepLabels.map((label, index) => ({
    label,
    status:
      index < stepIndex
        ? "completed"
        : index === stepIndex
          ? "current"
          : "upcoming",
  }));

  function goNext() {
    setStepIndex(Math.min(stepIndex + 1, stepLabels.length - 1));
  }

  function goBack() {
    setStepIndex(Math.max(stepIndex - 1, 0));
  }

  function canProceed(): boolean {
    if (stepIndex === 0) return data.type !== null;
    if (stepIndex === 1)
      return data.title.trim() !== "" && data.description.trim() !== "";
    return true;
  }

  async function persistCategories(id: number | string, originalIds: number[]) {
    const original = new Set(originalIds);
    const current = new Set(data.categoryIds);
    const toAdd = data.categoryIds.filter((c) => !original.has(c));
    const toRemove = originalIds.filter((c) => !current.has(c));
    await Promise.all([
      ...toAdd.map((categoryId) => assignCategory(id, categoryId)),
      ...toRemove.map((categoryId) => removeCategory(id, categoryId)),
    ]);
  }

  async function persistChildCollections(id: number | string) {
    // Always replace-all, even with an empty array — these are full-replace
    // endpoints (DELETE then re-INSERT), so an empty array is how the user
    // clears a collection down to nothing. Skipping the call on empty left
    // stale rows behind forever.
    const links = data.socialLinks.filter((l) => l.url.trim() !== "");
    await replaceEventSocialLinks(id, links);

    const media = data.mediaUrls
      .filter((url) => url.trim() !== "")
      .map((url, index) => ({ url, sortOrder: index }));
    await replaceEventMedia(id, media);

    const timeline = toTimelinePayload(data);
    await replaceEventTimeline(id, timeline);

    const rounds = toRoundsPayload(data);
    await replaceEventRounds(id, rounds);

    // Cover image: recover the bytes from the blob: preview URL and upload.
    if (data.coverImageUrl.startsWith("blob:")) {
      const blob = await fetch(data.coverImageUrl).then((r) => r.blob());
      await uploadCoverImage(id, blob);
    }
  }

  async function handleCreate(
    statusId: number | undefined,
    action: "draft" | "publish",
  ) {
    if (!data.type) return;
    setPendingAction(action);
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { id } = await createEvent({
        ...toCreatePayload(data),
        status_id: statusId,
      });
      await persistChildCollections(id);
      await persistCategories(id, []);
      // TODO: upload cover image (blob -> hosted URL) then set-cover-image
      router.push(`/my-organized-events/${id}`);
    } catch (error) {
      console.error("Failed to create event", error);
      setSubmitError(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Couldn't create this event. Try again.",
      );
      setSubmitting(false);
      setPendingAction(null);
    }
  }

  async function handleUpdate(
    statusId: number | undefined,
    action: "draft" | "publish",
  ) {
    if (!data.type || !eventId) return;
    setPendingAction(action);
    setSubmitting(true);
    setSubmitError(null);
    try {
      await updateEvent(eventId, {
        ...toCreatePayload(data),
        status_id: statusId,
      });
      await persistChildCollections(eventId);
      await persistCategories(eventId, initialData?.categoryIds ?? []);
      router.push(`/my-organized-events/${eventId}`);
    } catch (error) {
      console.error("Failed to update event", error);
      setSubmitError(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Couldn't save changes to this event. Try again.",
      );
      setSubmitting(false);
      setPendingAction(null);
    }
  }

  function handleSaveAsDraft() {
    if (mode === "create") handleCreate(draftStatusId, "draft");
    else handleUpdate(draftStatusId, "draft");
  }

  function handlePublish() {
    if (mode === "create") handleCreate(openStatusId, "publish");
    else handleUpdate(openStatusId, "publish");
  }

  const isLastStep = stepIndex === stepLabels.length - 1;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-display text-text-primary font-extrabold">
            {mode === "create" ? "Host an Event" : "Edit Event"}
          </h1>
          <p className="text-body text-text-secondary">
            {mode === "create"
              ? "Set up your event."
              : "Update your event details."}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={goBack}
          disabled={stepIndex === 0 || submitting}
          className="shrink-0"
        >
          <Icon icon={ArrowLeft} size="sm" /> Back
        </Button>
      </div>

      <Card>
        <StepIndicator steps={steps} />
      </Card>

      <Card padding="md">
        {stepIndex === 0 && (
          <StepEventType
            value={data.type}
            onChange={(type) => update("type", type)}
          />
        )}
        {stepIndex === 1 && <StepDetails data={data} onChange={update} />}
        {stepIndex === 2 && <StepRegistration data={data} onChange={update} />}
        {stepIndex === 3 && <StepScheduleMode data={data} onChange={update} />}
        {stepIndex === 4 && <StepTimelineLinks data={data} onChange={update} />}
        {stepIndex === 5 && <StepRounds data={data} onChange={update} />}
        {stepIndex === 6 && (
          <StepAdditionalInfo data={data} onChange={update} />
        )}
        {stepIndex === 7 && <StepTerms data={data} onChange={update} />}
        {isLastStep && <StepReview data={data} />}
      </Card>

      {submitError && <Banner tone="danger">{submitError}</Banner>}

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={handleCancelClick}
          disabled={submitting}
        >
          Cancel
        </Button>
        <div className="flex items-center gap-3">
          {!isLastStep ? (
            <Button variant="primary" onClick={goNext} disabled={!canProceed()}>
              Next <Icon icon={ArrowRight} size="sm" />
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={handleSaveAsDraft}
                loading={submitting && pendingAction === "draft"}
                disabled={submitting}
              >
                Save as Draft
              </Button>
              <Button
                variant="primary"
                onClick={handlePublish}
                loading={submitting && pendingAction === "publish"}
                disabled={submitting}
              >
                {mode === "create" ? "Publish Event" : "Save & Publish"}
              </Button>
            </>
          )}
        </div>
      </div>

      <Modal
        open={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        title="Discard unsaved changes?"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowCancelConfirm(false)}
            >
              Keep editing
            </Button>
            <Button variant="primary" onClick={() => router.push(cancelHref)}>
              Discard changes
            </Button>
          </>
        }
      >
        <p className="text-body text-text-secondary">
          You have unsaved changes to this event. Leaving now will discard them.
        </p>
      </Modal>
    </div>
  );
}
