import type { Candidate } from "@/entities/candidate";
import type {
  AvailabilityStatus,
  ParticipantResponsePayload,
  TravelBurden,
} from "@/entities/participant-response";
import type { ParticipantCondition } from "@/entities/participant-condition";
import { MEETPOINT_TIMEZONE } from "@/shared/config/meetpoint";

export type ResponseMessageKind = "success" | "error" | "info";

export type ResponseForm = {
  availabilityStatus: AvailabilityStatus | null;
  travelBurden: TravelBurden | null;
  note: string;
  savedResponseId: string | null;
  savedAvailabilityStatus: AvailabilityStatus | null;
  savedTravelBurden: TravelBurden | null;
  savedNote: string;
  message: string;
  messageKind: ResponseMessageKind | null;
  isSubmitting: boolean;
};

export type ResponseSaveOverrides = Partial<
  Pick<ResponseForm, "availabilityStatus" | "travelBurden" | "note">
>;

export type PanelMessage = {
  text: string;
  kind: ResponseMessageKind;
};

export const availabilityOptions: Array<{
  value: AvailabilityStatus;
  label: string;
}> = [
  { value: "AVAILABLE", label: "가능" },
  { value: "MAYBE", label: "보류" },
  { value: "UNAVAILABLE", label: "불가" },
];

export const travelOptions: Array<{ value: TravelBurden; label: string }> = [
  { value: "EASY", label: "쉬움" },
  { value: "NORMAL", label: "보통" },
  { value: "HARD", label: "어려움" },
];

export function createResponseForm(
  response?: ParticipantResponsePayload,
): ResponseForm {
  const availabilityStatus = response?.availabilityStatus ?? null;
  const travelBurden = response?.travelBurden ?? null;
  const note = response?.note ?? "";

  return {
    availabilityStatus,
    travelBurden,
    note,
    savedResponseId: response?.id ?? null,
    savedAvailabilityStatus: availabilityStatus,
    savedTravelBurden: travelBurden,
    savedNote: note,
    message: "",
    messageKind: null,
    isSubmitting: false,
  };
}

export function createInitialForms(
  candidates: Candidate[],
  responses: ParticipantResponsePayload[],
) {
  const responsesByCandidateId = new Map(
    responses.map((response) => [response.candidateId, response]),
  );

  return candidates.reduce<Record<string, ResponseForm>>(
    (forms, candidate) => {
      forms[candidate.id] = createResponseForm(
        responsesByCandidateId.get(candidate.id),
      );
      return forms;
    },
    {},
  );
}

export function isFormDirty(form: ResponseForm) {
  return (
    form.availabilityStatus !== form.savedAvailabilityStatus ||
    form.travelBurden !== form.savedTravelBurden ||
    form.note !== form.savedNote
  );
}

export function getResponseState(form: ResponseForm) {
  if (isFormDirty(form)) {
    return "dirty" as const;
  }

  return form.savedResponseId ? ("saved" as const) : ("missing" as const);
}

export function getMissingFields(form: ResponseForm) {
  const missingFields: string[] = [];

  if (!form.availabilityStatus) {
    missingFields.push("가능 여부");
  }
  if (!form.travelBurden) {
    missingFields.push("이동 부담");
  }

  return missingFields;
}

export function getMissingFieldsMessage(form: ResponseForm) {
  const missingFields = getMissingFields(form);

  if (missingFields.length === 0) {
    return "";
  }
  if (missingFields.length === 2) {
    return "가능 여부와 이동 부담을 모두 선택해 주세요.";
  }

  return missingFields[0] === "가능 여부"
    ? "가능 여부를 선택해 주세요."
    : "이동 부담을 선택해 주세요.";
}

export function getMissingFieldsDescription(form: ResponseForm) {
  const missingFields = getMissingFields(form);

  if (missingFields.length === 0) {
    return "";
  }
  if (missingFields.length === 2) {
    return "가능 여부와 이동 부담을 모두 선택해야 합니다.";
  }

  return missingFields[0] === "가능 여부"
    ? "가능 여부를 선택해야 합니다."
    : "이동 부담을 선택해야 합니다.";
}

export function getConditionWarnings(
  candidate: Candidate,
  condition: ParticipantCondition | null | undefined,
  availabilityStatus: AvailabilityStatus | null,
) {
  if (!condition || !availabilityStatus || availabilityStatus === "UNAVAILABLE") {
    return [];
  }

  const candidateStart = new Date(candidate.time.startsAt).getTime();
  const candidateEnd = new Date(candidate.time.endsAt).getTime();
  const warnings: string[] = [];

  if (
    !Number.isNaN(candidateStart) &&
    !Number.isNaN(candidateEnd) &&
    !condition.availabilityWindows.some((window) => {
      const windowStart = new Date(window.startsAt).getTime();
      const windowEnd = new Date(window.endsAt).getTime();
      return (
        !Number.isNaN(windowStart) &&
        !Number.isNaN(windowEnd) &&
        candidateStart >= windowStart &&
        candidateEnd <= windowEnd
      );
    })
  ) {
    warnings.push("내가 입력한 가능 시간 밖입니다.");
  }

  if (
    condition.maxBudgetKrw !== null &&
    candidate.estimatedCostPerPersonKrw > condition.maxBudgetKrw
  ) {
    warnings.push(
      `예상 비용이 내 예산 한도(${condition.maxBudgetKrw.toLocaleString("ko-KR")}원)를 넘습니다.`,
    );
  }

  const candidateTags = new Set(
    candidate.tags.map((tag) => tag.trim().toUpperCase()),
  );
  const missingRequiredTags = condition.preferences.requiredTags.filter(
    (tag) => !candidateTags.has(tag.trim().toUpperCase()),
  );
  if (missingRequiredTags.length > 0) {
    warnings.push(`필요한 특징이 빠져 있습니다: ${missingRequiredTags.join(", ")}`);
  }

  const presentAvoidTags = condition.preferences.avoidTags.filter((tag) =>
    candidateTags.has(tag.trim().toUpperCase()),
  );
  if (presentAvoidTags.length > 0) {
    warnings.push(`피하고 싶은 특징이 포함되어 있습니다: ${presentAvoidTags.join(", ")}`);
  }

  return warnings;
}

export function formatCandidateTime(candidate: Candidate) {
  const startsAt = new Date(candidate.time.startsAt);
  const endsAt = new Date(candidate.time.endsAt);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return `${candidate.time.startsAt} ~ ${candidate.time.endsAt}`;
  }

  return `${startsAt.toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: MEETPOINT_TIMEZONE,
  })} ~ ${endsAt.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: MEETPOINT_TIMEZONE,
  })}`;
}

export function messageClassName(kind: ResponseMessageKind) {
  if (kind === "success") {
    return "text-emerald-700";
  }
  if (kind === "info") {
    return "text-slate-600";
  }

  return "text-rose-600";
}

export function responseStateLabel(state: ReturnType<typeof getResponseState>) {
  if (state === "saved") {
    return "저장됨";
  }
  if (state === "dirty") {
    return "변경 후 저장 필요";
  }

  return "아직 저장된 의견 없음";
}

export function responseStateClassName(
  state: ReturnType<typeof getResponseState>,
) {
  if (state === "saved") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (state === "dirty") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-slate-100 text-slate-600";
}
