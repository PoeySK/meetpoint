"use client";

import { useEffect, useState } from "react";
import { upsertParticipantResponse } from "@/entities/participant-response";
import type {
  AvailabilityStatus,
  ParticipantResponsePayload,
  TravelBurden,
} from "@/entities/participant-response";
import type { Candidate } from "@/entities/candidate";
import type { ParticipantCondition } from "@/entities/participant-condition";
import { RoomApiError } from "@/shared/api/http-client";
import {
  createInitialForms,
  createResponseForm,
  getMissingFields,
  getMissingFieldsMessage,
  editResponseForm,
  fillFormsFromCondition,
  synchronizeResponseForms,
  type ResponseSaveOverrides,
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
  condition?: ParticipantCondition | null;
  isReadOnly?: boolean;
  onRoomRefresh: () => Promise<void>;
};

function describeResponseError(error: unknown) {
  if (error instanceof RoomApiError) {
    if (error.code === "TOKEN_EXPIRED" || error.code === "INVALID_TOKEN") {
      return "방 입장 정보가 만료되었습니다. 방에 다시 입장해 주세요.";
    }
    if (error.code === "ROOM_STATE_CONFLICT") {
      return "지금은 의견을 수정할 수 없습니다.";
    }
    if (error.code === "RESOURCE_NOT_FOUND") {
      return "의견을 남길 후보를 찾을 수 없습니다.";
    }
    if (error.code === "VALIDATION_ERROR") {
      return "의견 입력을 다시 확인해 주세요.";
    }
  }

  return "의견을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function ParticipantResponsePanel({
  roomId,
  token,
  participantId,
  candidates,
  responses,
  condition = null,
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
  const [fillMessage, setFillMessage] = useState<string | null>(null);
  const activeCandidates = candidates.filter(
    (candidate) => candidate.status === "ACTIVE",
  );

  const responsesByCandidateId = new Map(
    responses.map((response) => [response.candidateId, response]),
  );
  const hasSubmittingForm = Object.values(forms).some(
    (form) => form.isSubmitting,
  );
  const isInteractionDisabled =
    isReadOnly || isBulkSubmitting || hasSubmittingForm;

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setForms((current) =>
        synchronizeResponseForms(current, candidates, responses),
      );
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

  function fillFromCondition() {
    if (isInteractionDisabled || !condition) return;
    const result = fillFormsFromCondition(
      forms,
      activeCandidates,
      responses,
      condition,
    );
    setForms(result.forms);
    setFillMessage(
      `${result.applied}개 후보의 가능 여부를 초안으로 채웠습니다. ${result.excluded}개는 저장된 의견·직접 편집·저장 중 상태로 제외했습니다. 아직 제출되지 않았습니다.`,
    );
  }

  function setSavedResponse(
    candidateId: string,
    response: ParticipantResponsePayload,
    message: string,
  ) {
    setForms((current) => {
      return {
        ...current,
        [candidateId]: {
          ...createResponseForm(response),
          message,
          messageKind: "success",
          isSubmitting: false,
        },
      };
    });
  }

  async function saveResponse(
    candidateId: string,
    overrides: ResponseSaveOverrides = {},
  ) {
    if (
      isReadOnly ||
      isBulkSubmitting ||
      getForm(candidateId).isSubmitting ||
      !activeCandidates.some((candidate) => candidate.id === candidateId)
    ) {
      return;
    }

    const form = { ...getForm(candidateId), ...overrides };
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
        "저장한 의견이 반영되었습니다.",
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

  async function saveAllResponses(
    quickResponse?: Pick<
      ResponseSaveOverrides,
      "availabilityStatus" | "travelBurden"
    >,
  ) {
    if (isInteractionDisabled || activeCandidates.length === 0) {
      return;
    }

    const formsToSave = activeCandidates.map((candidate) => ({
      candidate,
      form: {
        ...getForm(candidate.id),
        ...quickResponse,
      },
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
        text: `모든 후보에 가능 여부와 이동 부담을 선택해 주세요. 아직 선택하지 않은 후보 ${incompleteForms.length}개가 있습니다.`,
        kind: "error",
      });
      return;
    }

    setIsBulkSubmitting(true);
    setBulkMessage({
      text: `${activeCandidates.length}개 후보의 의견을 저장하는 중입니다...`,
      kind: "info",
    });
    setForms((current) => {
      const next = { ...current };
      for (const { candidate, form } of formsToSave) {
        next[candidate.id] = {
          ...form,
          manuallyEdited: true,
          autoFill: quickResponse ? null : form.autoFill,
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
          "저장한 의견이 일괄 반영되었습니다.",
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
          ? `${successCount}개 후보의 의견을 모두 저장했습니다.`
          : `${successCount}개 저장 완료, ${failureCount}개 저장 실패입니다. 실패한 후보의 입력은 유지됩니다.`,
      kind: failureCount === 0 ? "success" : "error",
    });
    if (successCount > 0) {
      await onRoomRefresh();
    }
  }

  function saveQuickResponses() {
    if (!fastAvailabilityStatus || !fastTravelBurden) {
      setBulkMessage({
        text: "모든 후보에 저장하려면 가능 여부와 이동 부담을 모두 선택해 주세요.",
        kind: "error",
      });
      return;
    }

    void saveAllResponses({
      availabilityStatus: fastAvailabilityStatus,
      travelBurden: fastTravelBurden,
    });
  }

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-emerald-700">내 의견</p>
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">
          후보별 의견
        </h2>
        <p className="text-sm leading-6 text-slate-500">
          미응답 후보는 보류로 표시하지만 아직 미제출입니다. 참석 가능 여부와
          이동 부담을 확인한 뒤 의견 저장을 누르세요. 메모는 선택 사항입니다.
        </p>
        {isReadOnly && (
          <p className="rounded-xl bg-slate-100 px-3 py-2.5 text-sm leading-5 text-slate-600">
            현재 방 상태에서는 의견을 수정할 수 없습니다. 계산 중에는 완료를
            기다리고, 확정된 방은 방장이 다시 살펴보기를 시작해야 합니다.
          </p>
        )}
      </div>

      {activeCandidates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/65 p-4 text-sm leading-5 text-slate-500">
          방장이 후보를 등록하면 이곳에서 의견을 남길 수 있습니다.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-sky-100 bg-sky-50/55 p-4 space-y-2">
            <button
              className="mp-button mp-button-secondary"
              type="button"
              disabled={isInteractionDisabled || !condition}
              onClick={fillFromCondition}
            >
              {Object.values(forms).some((form) => form.autoFill)
                ? "내 기준으로 다시 채우기"
                : "내 기준으로 의견 채우기"}
            </button>
            <p className="text-xs leading-5 text-slate-600">
              {condition
                ? "서버에서 불러온 저장된 내 기준을 사용합니다. 가능 여부만 초안으로 채우며, 저장된 의견과 직접 편집한 후보는 유지합니다. 내 기준을 바꿔도 초안을 자동으로 덮어쓰지 않습니다."
                : "저장된 내 기준이 없습니다. 내 기준을 먼저 저장해 주세요. 저장하지 않은 입력은 사용할 수 없습니다."}
            </p>
            {fillMessage && (
              <p role="status" className="text-sm text-slate-700">
                {fillMessage}
              </p>
            )}
          </div>
          <QuickResponsePanel
            availabilityStatus={fastAvailabilityStatus}
            isDisabled={isInteractionDisabled}
            message={bulkMessage}
            onAvailabilityChange={setFastAvailabilityStatus}
            onSave={saveQuickResponses}
            onTravelChange={setFastTravelBurden}
            travelBurden={fastTravelBurden}
          />

          <div className="grid gap-3 lg:grid-cols-2">
            {activeCandidates.map((candidate) => (
              <CandidateResponseCard
                candidate={candidate}
                condition={condition}
                form={getForm(candidate.id)}
                isBulkSubmitting={isBulkSubmitting}
                isReadOnly={isReadOnly}
                key={candidate.id}
                onSave={(overrides) =>
                  void saveResponse(candidate.id, overrides)
                }
                onUpdate={(update) =>
                  setForms((current) => ({
                    ...current,
                    [candidate.id]: editResponseForm(
                      current[candidate.id] ?? getForm(candidate.id),
                      update,
                    ),
                  }))
                }
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
