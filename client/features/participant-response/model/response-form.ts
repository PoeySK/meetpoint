import type { Candidate } from "@/entities/candidate/model/types";
import type {
  AvailabilityStatus,
  ParticipantResponsePayload,
  TravelBurden,
} from "@/entities/participant-response/model/types";
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

  return "아직 저장된 응답 없음";
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
