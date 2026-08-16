"use client";

import { useEffect, useState } from "react";
import {
  RoomApiError,
  MEETPOINT_TIMEZONE,
  type AvailabilityStatus,
  type Candidate,
  type ParticipantResponsePayload,
  type TravelBurden,
  upsertParticipantResponse,
} from "@/lib/rooms";

type ParticipantResponsePanelProps = {
  roomId: string;
  token: string;
  participantId: string;
  candidates: Candidate[];
  responses: ParticipantResponsePayload[];
};

type ResponseMessageKind = "success" | "error" | "info";

type ResponseForm = {
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

type PanelMessage = {
  text: string;
  kind: ResponseMessageKind;
};

const availabilityOptions: Array<{
  value: AvailabilityStatus;
  label: string;
}> = [
  { value: "AVAILABLE", label: "가능" },
  { value: "MAYBE", label: "보류" },
  { value: "UNAVAILABLE", label: "불가" },
];

const travelOptions: Array<{ value: TravelBurden; label: string }> = [
  { value: "EASY", label: "쉬움" },
  { value: "NORMAL", label: "보통" },
  { value: "HARD", label: "어려움" },
];

function createResponseForm(
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

function createInitialForms(
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

function isFormDirty(form: ResponseForm) {
  return (
    form.availabilityStatus !== form.savedAvailabilityStatus ||
    form.travelBurden !== form.savedTravelBurden ||
    form.note !== form.savedNote
  );
}

function getResponseState(form: ResponseForm) {
  if (isFormDirty(form)) {
    return "dirty" as const;
  }

  return form.savedResponseId ? ("saved" as const) : ("missing" as const);
}

function getMissingFields(form: ResponseForm) {
  const missingFields: string[] = [];

  if (!form.availabilityStatus) {
    missingFields.push("가능 여부");
  }
  if (!form.travelBurden) {
    missingFields.push("이동 부담");
  }

  return missingFields;
}

function getMissingFieldsMessage(form: ResponseForm) {
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

function getMissingFieldsDescription(form: ResponseForm) {
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

function describeResponseError(error: unknown) {
  if (error instanceof RoomApiError) {
    if (error.code === "TOKEN_EXPIRED" || error.code === "INVALID_TOKEN") {
      return "입장 토큰이 유효하지 않습니다. 방에 다시 입장해 주세요.";
    }
    if (error.code === "ROOM_STATE_CONFLICT") {
      return "현재 방 상태에서는 응답을 수정할 수 없습니다.";
    }
    if (error.code === "RESOURCE_NOT_FOUND") {
      return "응답 대상 후보를 찾을 수 없습니다.";
    }
    if (error.code === "VALIDATION_ERROR") {
      return "응답 입력을 다시 확인하세요.";
    }
  }

  return "응답을 저장하지 못했습니다. 잠시 후 다시 시도하세요.";
}

function formatCandidateTime(candidate: Candidate) {
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

function messageClassName(kind: ResponseMessageKind) {
  if (kind === "success") {
    return "text-emerald-700";
  }
  if (kind === "info") {
    return "text-slate-600";
  }

  return "text-rose-600";
}

function responseStateLabel(state: ReturnType<typeof getResponseState>) {
  if (state === "saved") {
    return "저장됨";
  }
  if (state === "dirty") {
    return "변경 후 저장 필요";
  }

  return "아직 저장된 응답 없음";
}

function responseStateClassName(state: ReturnType<typeof getResponseState>) {
  if (state === "saved") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (state === "dirty") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-slate-100 text-slate-600";
}

export function ParticipantResponsePanel({
  roomId,
  token,
  participantId,
  candidates,
  responses,
}: ParticipantResponsePanelProps) {
  const [forms, setForms] = useState<Record<string, ResponseForm>>(() =>
    createInitialForms(candidates, responses),
  );
  const [fastAvailabilityStatus, setFastAvailabilityStatus] =
    useState<AvailabilityStatus | null>(null);
  const [fastTravelBurden, setFastTravelBurden] =
    useState<TravelBurden | null>(null);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<PanelMessage | null>(null);

  const responsesByCandidateId = new Map(
    responses.map((response) => [response.candidateId, response]),
  );
  const hasSubmittingForm = Object.values(forms).some(
    (form) => form.isSubmitting,
  );
  const isInteractionDisabled = isBulkSubmitting || hasSubmittingForm;

  useEffect(() => {
    const incomingResponsesByCandidateId = new Map(
      responses.map((response) => [response.candidateId, response]),
    );

    const timerId = window.setTimeout(() => {
      setForms((current) => {
        let next = current;

        for (const candidate of candidates) {
          const existing = current[candidate.id];
          if (!existing) {
            next = {
              ...next,
              [candidate.id]: createResponseForm(
                incomingResponsesByCandidateId.get(candidate.id),
              ),
            };
            continue;
          }

          if (existing.isSubmitting || isFormDirty(existing)) {
            continue;
          }

          const hydrated = createResponseForm(
            incomingResponsesByCandidateId.get(candidate.id),
          );
          const savedSnapshotChanged =
            existing.savedResponseId !== hydrated.savedResponseId ||
            existing.savedAvailabilityStatus !==
              hydrated.savedAvailabilityStatus ||
            existing.savedTravelBurden !== hydrated.savedTravelBurden ||
            existing.savedNote !== hydrated.savedNote;

          if (savedSnapshotChanged) {
            next = { ...next, [candidate.id]: hydrated };
          }
        }

        return next;
      });
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [candidates, responses]);

  function getForm(candidateId: string) {
    return (
      forms[candidateId] ??
      createResponseForm(responsesByCandidateId.get(candidateId))
    );
  }

  function updateForm(candidateId: string, update: Partial<ResponseForm>) {
    setForms((current) => ({
      ...current,
      [candidateId]: {
        ...(current[candidateId] ??
          createResponseForm(responsesByCandidateId.get(candidateId))),
        ...update,
      },
    }));
  }

  function setSavedResponse(
    candidateId: string,
    response: ParticipantResponsePayload,
    message: string,
  ) {
    const note = response.note ?? "";

    setForms((current) => {
      const form =
        current[candidateId] ??
        createResponseForm(responsesByCandidateId.get(candidateId));

      return {
        ...current,
        [candidateId]: {
          ...form,
          availabilityStatus: response.availabilityStatus,
          travelBurden: response.travelBurden,
          note,
          savedResponseId: response.id,
          savedAvailabilityStatus: response.availabilityStatus,
          savedTravelBurden: response.travelBurden,
          savedNote: note,
          message,
          messageKind: "success",
          isSubmitting: false,
        },
      };
    });
  }

  async function saveResponse(candidateId: string) {
    if (isBulkSubmitting) {
      return;
    }

    const form = getForm(candidateId);
    const missingFieldsMessage = getMissingFieldsMessage(form);
    if (missingFieldsMessage) {
      updateForm(candidateId, {
        message: missingFieldsMessage,
        messageKind: "error",
        isSubmitting: false,
      });
      return;
    }

    updateForm(candidateId, {
      isSubmitting: true,
      message: "",
      messageKind: null,
    });

    try {
      const result = await upsertParticipantResponse(
        roomId,
        participantId,
        candidateId,
        token,
        {
          availabilityStatus: form.availabilityStatus!,
          travelBurden: form.travelBurden!,
          note: form.note.trim() || null,
        },
      );
      setSavedResponse(
        candidateId,
        result.response,
        "저장됨 · 응답이 반영되었습니다.",
      );
    } catch (error) {
      updateForm(candidateId, {
        isSubmitting: false,
        message: describeResponseError(error),
        messageKind: "error",
      });
    }
  }

  function applyFastResponse() {
    if (!fastAvailabilityStatus || !fastTravelBurden) {
      setBulkMessage({
        text: "전체 후보에 적용하려면 가능 여부와 이동 부담을 모두 선택해 주세요.",
        kind: "error",
      });
      return;
    }

    setForms((current) => {
      const next = { ...current };

      for (const candidate of candidates) {
        const form =
          current[candidate.id] ??
          createResponseForm(responsesByCandidateId.get(candidate.id));
        next[candidate.id] = {
          ...form,
          availabilityStatus: fastAvailabilityStatus,
          travelBurden: fastTravelBurden,
          message: "",
          messageKind: null,
        };
      }

      return next;
    });
    setBulkMessage({
      text: "전체 후보에 입력을 적용했습니다. 아직 Server에 저장하지 않은 값입니다.",
      kind: "info",
    });
  }

  async function saveAllResponses() {
    if (isInteractionDisabled || candidates.length === 0) {
      return;
    }

    const formsToSave = candidates.map((candidate) => ({
      candidate,
      form: getForm(candidate.id),
    }));
    const incompleteForms = formsToSave.filter(
      ({ form }) => getMissingFields(form).length > 0,
    );

    if (incompleteForms.length > 0) {
      setForms((current) => {
        const next = { ...current };

        for (const { candidate, form } of incompleteForms) {
          next[candidate.id] = {
            ...form,
            message: getMissingFieldsMessage(form),
            messageKind: "error",
          };
        }

        return next;
      });
      setBulkMessage({
        text: `모든 후보의 필수 응답을 선택한 뒤 저장하세요. 미완료 후보 ${incompleteForms.length}개가 있습니다.`,
        kind: "error",
      });
      return;
    }

    setIsBulkSubmitting(true);
    setBulkMessage({
      text: `${candidates.length}개 후보의 응답을 저장하는 중입니다...`,
      kind: "info",
    });
    setForms((current) => {
      const next = { ...current };
      for (const { candidate } of formsToSave) {
        const form = current[candidate.id] ?? getForm(candidate.id);
        next[candidate.id] = {
          ...form,
          message: "일괄 저장 중...",
          messageKind: "info",
        };
      }
      return next;
    });

    const results = await Promise.allSettled(
      formsToSave.map(({ candidate, form }) =>
        upsertParticipantResponse(
          roomId,
          participantId,
          candidate.id,
          token,
          {
            availabilityStatus: form.availabilityStatus!,
            travelBurden: form.travelBurden!,
            note: form.note.trim() || null,
          },
        ),
      ),
    );

    let successCount = 0;
    let failureCount = 0;
    results.forEach((result, index) => {
      const candidateId = formsToSave[index].candidate.id;

      if (result.status === "fulfilled") {
        successCount += 1;
        setSavedResponse(
          candidateId,
          result.value.response,
          "저장됨 · 일괄 저장이 반영되었습니다.",
        );
      } else {
        failureCount += 1;
        updateForm(candidateId, {
          isSubmitting: false,
          message: describeResponseError(result.reason),
          messageKind: "error",
        });
      }
    });

    setIsBulkSubmitting(false);
    setBulkMessage({
      text:
        failureCount === 0
          ? `${successCount}개 후보의 응답을 모두 저장했습니다.`
          : `${successCount}개 저장 완료, ${failureCount}개 저장 실패입니다. 실패한 후보의 입력은 유지됩니다.`,
      kind: failureCount === 0 ? "success" : "error",
    });
  }

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-emerald-700">참여자 응답</p>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
          후보별 응답
        </h2>
        <p className="text-sm leading-6 text-slate-500">
          각 후보의 가능 여부와 이동 부담을 선택하세요. 저장하지 않은 값은 계산에
          반영되지 않습니다.
        </p>
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-sm leading-6 text-slate-500">
          호스트가 후보를 등록하면 이곳에서 응답할 수 있습니다.
        </div>
      ) : (
        <>
          <section
            aria-labelledby="quick-response-heading"
            className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5 sm:p-6"
          >
            <div className="space-y-2">
              <h3
                className="text-lg font-semibold text-slate-950"
                id="quick-response-heading"
              >
                빠른 응답 입력
              </h3>
              <p className="text-sm leading-6 text-slate-600">
                선택한 값을 전체 후보 폼에 먼저 적용합니다. &quot;전체 후보에 적용&quot;은
                입력만 채우며, 실제 저장은 별도로 확인해야 합니다.
              </p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-slate-800">
                  전체 가능 여부
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {availabilityOptions.map((option) => (
                    <button
                      aria-pressed={fastAvailabilityStatus === option.value}
                      className={`rounded-xl border px-2 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                        fastAvailabilityStatus === option.value
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-white bg-white text-slate-600 hover:border-emerald-300"
                      }`}
                      disabled={isInteractionDisabled}
                      key={option.value}
                      onClick={() => setFastAvailabilityStatus(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-slate-800">
                  전체 이동 부담
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {travelOptions.map((option) => (
                    <button
                      aria-pressed={fastTravelBurden === option.value}
                      className={`rounded-xl border px-2 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                        fastTravelBurden === option.value
                          ? "border-slate-950 bg-slate-950 text-white"
                          : "border-white bg-white text-slate-600 hover:border-slate-400"
                      }`}
                      disabled={isInteractionDisabled}
                      key={option.value}
                      onClick={() => setFastTravelBurden(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                className="rounded-xl border border-emerald-700 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isInteractionDisabled}
                onClick={applyFastResponse}
                type="button"
              >
                전체 후보에 적용
              </button>
              <button
                className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-emerald-300"
                disabled={isInteractionDisabled}
                onClick={() => void saveAllResponses()}
                type="button"
              >
                전체 후보 저장
              </button>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-600">
              이동 부담은 실제 거리나 시간이 아니라 참여자가 느끼는 자기 평가입니다.
              저장하지 않은 입력은 Server와 계산에 전달되지 않습니다.
            </p>
            {bulkMessage && (
              <p
                aria-live="polite"
                className={`mt-3 text-sm leading-6 ${messageClassName(bulkMessage.kind)}`}
              >
                {bulkMessage.text}
              </p>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            {candidates.map((candidate) => {
              const form = getForm(candidate.id);
              const responseState = getResponseState(form);
              const missingFieldsMessage = getMissingFieldsMessage(form);
              const missingFieldsDescription =
                getMissingFieldsDescription(form);

              return (
                <article
                  className={`rounded-2xl border bg-white p-5 shadow-sm ${
                    responseState === "saved"
                      ? "border-emerald-200"
                      : responseState === "dirty"
                        ? "border-amber-200"
                        : "border-slate-200"
                  }`}
                  key={candidate.id}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg font-semibold text-slate-950">
                        {candidate.place.name}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        후보 {candidate.displayOrder}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${responseStateClassName(responseState)}`}
                      >
                        {responseStateLabel(responseState)}
                      </span>
                      {responseState === "missing" && (
                        <span className="text-xs text-slate-500">
                          아직 계산에 반영될 저장 응답이 없습니다.
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600">
                      {formatCandidateTime(candidate)}
                    </p>
                    <p className="text-sm text-slate-600">
                      {candidate.place.address} · {candidate.place.area}
                    </p>
                    <p className="text-sm font-medium text-slate-700">
                      1인 약 {candidate.estimatedCostPerPersonKrw.toLocaleString("ko-KR")}원
                    </p>
                    {candidate.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {candidate.tags.map((tag) => (
                          <span
                            className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                            key={tag}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-semibold text-slate-800">
                        참석 가능 여부
                      </legend>
                      <div className="grid grid-cols-3 gap-2">
                        {availabilityOptions.map((option) => (
                          <button
                            aria-pressed={
                              form.availabilityStatus === option.value
                            }
                            className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                              form.availabilityStatus === option.value
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300"
                            }`}
                            disabled={
                              form.isSubmitting || isBulkSubmitting
                            }
                            key={option.value}
                            onClick={() =>
                              updateForm(candidate.id, {
                                availabilityStatus: option.value,
                                message: "",
                                messageKind: null,
                              })
                            }
                            type="button"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    <fieldset className="space-y-2">
                      <legend className="text-sm font-semibold text-slate-800">
                        이동 부담
                      </legend>
                      <div className="grid grid-cols-3 gap-2">
                        {travelOptions.map((option) => (
                          <button
                            aria-pressed={form.travelBurden === option.value}
                            className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                              form.travelBurden === option.value
                                ? "border-slate-950 bg-slate-950 text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                            }`}
                            disabled={
                              form.isSubmitting || isBulkSubmitting
                            }
                            key={option.value}
                            onClick={() =>
                              updateForm(candidate.id, {
                                travelBurden: option.value,
                                message: "",
                                messageKind: null,
                              })
                            }
                            type="button"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    <label className="block space-y-2 text-sm font-semibold text-slate-800">
                      메모 (선택)
                      <textarea
                        className="min-h-20 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50"
                        disabled={form.isSubmitting || isBulkSubmitting}
                        maxLength={300}
                        onChange={(event) =>
                          updateForm(candidate.id, {
                            note: event.target.value,
                            message: "",
                            messageKind: null,
                          })
                        }
                        placeholder="참여자에게 공유할 메모"
                        value={form.note}
                      />
                    </label>

                    {missingFieldsMessage && (
                      <p className="text-xs leading-5 text-amber-700">
                        저장하려면 {missingFieldsDescription} 선택하지 않은 값은
                        Server에 제출되지 않습니다.
                      </p>
                    )}

                    {form.message && form.messageKind && (
                      <p
                        aria-live="polite"
                        className={`text-sm leading-6 ${messageClassName(form.messageKind)}`}
                      >
                        {form.message}
                      </p>
                    )}

                    <button
                      className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-300"
                      disabled={form.isSubmitting || isBulkSubmitting}
                      onClick={() => void saveResponse(candidate.id)}
                      type="button"
                    >
                      {form.isSubmitting
                        ? "응답 저장 중..."
                        : isBulkSubmitting
                          ? "전체 후보 저장 중..."
                          : "응답 저장"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
