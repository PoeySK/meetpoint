"use client";

import { useEffect, useState } from "react";
import { upsertParticipantResponse } from "@/entities/participant-response";
import type {
  AvailabilityStatus,
  ParticipantResponsePayload,
  TravelBurden,
} from "@/entities/participant-response";
import type { Candidate } from "@/entities/candidate";
import { RoomApiError } from "@/shared/api/http-client";
import {
  createInitialForms,
  createResponseForm,
  getMissingFields,
  getMissingFieldsMessage,
  isFormDirty,
  type PanelMessage,
  type ResponseForm,
} from "@/features/participant-response/model/response-form";
import { CandidateResponseCard } from "@/features/participant-response/ui/candidate-response-card";
import { QuickResponsePanel } from "@/features/participant-response/ui/quick-response-panel";

type ParticipantResponsePanelProps = {
  roomId: string;
  token: string;
  participantId: string;
  candidates: Candidate[];
  responses: ParticipantResponsePayload[];
  isReadOnly?: boolean;
  onRoomRefresh: () => Promise<void>;
};

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
      return "응답 입력을 다시 확인해 주세요.";
    }
  }

  return "응답을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function ParticipantResponsePanel({
  roomId,
  token,
  participantId,
  candidates,
  responses,
  isReadOnly = false,
  onRoomRefresh,
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
  const isInteractionDisabled =
    isReadOnly || isBulkSubmitting || hasSubmittingForm;

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
        "저장한 응답이 반영되었습니다.",
      );
      await onRoomRefresh();
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
      text: "전체 후보에 입력값을 적용했습니다. 아직 Server에 저장하지 않은 값입니다.",
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
        text: `모든 후보의 필수 응답을 선택해 주세요. 미완료 후보 ${incompleteForms.length}개가 있습니다.`,
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
          "저장한 응답이 일괄 반영되었습니다.",
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
    if (successCount > 0) {
      await onRoomRefresh();
    }
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
        {isReadOnly && (
          <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-600">
            방이 확정되어 응답을 읽기 전용으로 표시합니다. 다시 변경하려면 호스트가
            먼저 재검토를 시작해야 합니다.
          </p>
        )}
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-sm leading-6 text-slate-500">
          호스트가 후보를 등록하면 이곳에서 응답할 수 있습니다.
        </div>
      ) : (
        <>
          <QuickResponsePanel
            availabilityStatus={fastAvailabilityStatus}
            isDisabled={isInteractionDisabled}
            message={bulkMessage}
            onApply={applyFastResponse}
            onAvailabilityChange={setFastAvailabilityStatus}
            onSave={() => void saveAllResponses()}
            onTravelChange={setFastTravelBurden}
            travelBurden={fastTravelBurden}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            {candidates.map((candidate) => (
              <CandidateResponseCard
                candidate={candidate}
                form={getForm(candidate.id)}
                isBulkSubmitting={isBulkSubmitting}
                isReadOnly={isReadOnly}
                key={candidate.id}
                onSave={() => void saveResponse(candidate.id)}
                onUpdate={(update) => updateForm(candidate.id, update)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
