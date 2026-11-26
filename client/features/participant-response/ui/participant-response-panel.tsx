'use client';

import type { Candidate } from '@/entities/candidate';
import type { ParticipantCondition } from '@/entities/participant-condition';
import type {
  AvailabilityStatus,
  ParticipantResponsePayload,
  TravelBurden,
} from '@/entities/participant-response';
import { upsertParticipantResponse } from '@/entities/participant-response';
import {
  createInitialForms,
  createResponseForm,
  editResponseForm,
  fillFormsFromCondition,
  getMissingFields,
  getMissingFieldsMessage,
  getResponseState,
  messageClassName,
  synchronizeResponseForms,
  type PanelMessage,
  type ResponseForm,
  type ResponseSaveOverrides,
} from '@/features/participant-response/model/response-form';
import { CandidateResponseCard } from '@/features/participant-response/ui/candidate-response-card';
import { QuickResponsePanel } from '@/features/participant-response/ui/quick-response-panel';
import { RoomApiError } from '@/shared/api/http-client';
import { getRoomAccessErrorMessage } from '@/shared/lib/room-access-error';
import { useEffect, useState } from 'react';

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
  if (error instanceof RoomApiError && error.status === 429) return error.message;
  const accessMessage = getRoomAccessErrorMessage(error);
  if (accessMessage) return accessMessage;
  if (error instanceof RoomApiError) {
    if (error.code === 'CANDIDATE_VERSION_CONFLICT') {
      return '후보가 변경되어 의견 재확인이 필요합니다. 입력은 유지됩니다. 최신 후보를 불러와 확인한 뒤 다시 저장해 주세요.';
    }
    if (error.code === 'ROOM_STATE_CONFLICT') {
      return '현재 방 상태에서는 의견을 수정할 수 없습니다.';
    }
    if (error.code === 'RESOURCE_NOT_FOUND') {
      return '이 후보는 더 이상 의견을 받을 수 없습니다.';
    }
    if (error.code === 'VALIDATION_ERROR') {
      return '의견 입력을 다시 확인해 주세요.';
    }
  }

  return '의견을 저장하지 못했습니다. 입력은 남아 있으니 잠시 후 다시 시도해 주세요.';
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
    createInitialForms(candidates, responses)
  );
  const [fastAvailabilityStatus, setFastAvailabilityStatus] =
    useState<AvailabilityStatus | null>(null);
  const [fastTravelBurden, setFastTravelBurden] = useState<TravelBurden | null>(
    null
  );
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<PanelMessage | null>(null);
  const [fillMessage, setFillMessage] = useState<string | null>(null);
  const activeCandidates = candidates.filter(
    (candidate) => candidate.status === 'ACTIVE'
  );

  const responsesByCandidateId = new Map(
    responses.map((response) => [response.candidateId, response])
  );
  const hasSubmittingForm = Object.values(forms).some(
    (form) => form.isSubmitting
  );
  const isInteractionDisabled =
    isReadOnly || isBulkSubmitting || hasSubmittingForm;

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setForms((current) =>
        synchronizeResponseForms(current, candidates, responses)
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

  const candidateForms = activeCandidates.map((candidate) => ({ candidate, form: getForm(candidate.id) }));
  const savedCount = candidateForms.filter(({ form }) => form.savedResponseId && !form.reconfirmRequired).length;
  const readyToSave = candidateForms.filter(({ form }) => {
    const state = getResponseState(form);
    const wasEdited = state === 'dirty' || (state === 'reconfirm' && form.manuallyEdited);
    return wasEdited && getMissingFields(form).length === 0;
  });

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
      condition
    );
    setForms(result.forms);
    setFillMessage(
      `${result.applied}개 후보의 참석 가능 여부를 채웠어요. 입력 중이거나 저장한 의견 등 ${result.excluded}개는 건너뛰었어요. 내용을 확인한 뒤 저장해 주세요.`
    );
  }

  function setSavedResponse(
    candidateId: string,
    response: ParticipantResponsePayload,
    message: string
  ) {
    setForms((current) => {
      return {
        ...current,
        [candidateId]: {
          ...createResponseForm(response),
          message,
          messageKind: 'success',
          isSubmitting: false,
        },
      };
    });
  }

  async function saveResponse(
    candidateId: string,
    overrides: ResponseSaveOverrides = {}
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
        messageKind: 'error',
        isSubmitting: false,
      });
      return;
    }

    updateForm(candidateId, {
      isSubmitting: true,
      message: '',
      messageKind: null,
    });

    try {
      const result = await upsertParticipantResponse(
        roomId,
        participantId,
        candidateId,
        token,
        {
          candidateVersion: activeCandidates.find((candidate) => candidate.id === candidateId)!.version,
          availabilityStatus: form.availabilityStatus!,
          travelBurden: form.travelBurden!,
          note: form.note.trim() || null,
        }
      );
      setSavedResponse(
        candidateId,
        result.response,
        '의견을 저장했습니다. 다음 추천 결과에 반영됩니다.'
      );
      await onRoomRefresh();
    } catch (error) {
      updateForm(candidateId, {
        isSubmitting: false,
        message: describeResponseError(error),
        messageKind: 'error',
      });
      if (error instanceof RoomApiError && error.code === 'CANDIDATE_VERSION_CONFLICT') {
        await onRoomRefresh().catch(() => undefined);
      }
    }
  }

  async function saveAllResponses(
    quickResponse?: Pick<
      ResponseSaveOverrides,
      'availabilityStatus' | 'travelBurden'
    >
  ) {
    if (isInteractionDisabled || activeCandidates.length === 0) {
      return;
    }

    const formsToSave = quickResponse
      ? candidateForms.map(({ candidate, form }) => ({ candidate, form: { ...form, ...quickResponse } }))
      : readyToSave;
    if (formsToSave.length === 0) return;

    setIsBulkSubmitting(true);
    setBulkMessage({
      text: `${formsToSave.length}개 후보의 의견을 저장하는 중입니다...`,
      kind: 'info',
    });
    setForms((current) => {
      const next = { ...current };
      for (const { candidate, form } of formsToSave) {
        next[candidate.id] = {
          ...form,
          manuallyEdited: true,
          autoFill: quickResponse ? null : form.autoFill,
          message: '일괄 저장 중...',
          messageKind: 'info',
        };
      }
      return next;
    });

    const results = await Promise.allSettled(
      formsToSave.map(({ candidate, form }) =>
        upsertParticipantResponse(roomId, participantId, candidate.id, token, {
          candidateVersion: candidate.version,
          availabilityStatus: form.availabilityStatus!,
          travelBurden: form.travelBurden!,
          note: form.note.trim() || null,
        })
      )
    );

    let successCount = 0;
    let failureCount = 0;
    results.forEach((result, index) => {
      const candidateId = formsToSave[index].candidate.id;

      if (result.status === 'fulfilled') {
        successCount += 1;
        setSavedResponse(
          candidateId,
          result.value.response,
          '의견을 저장했습니다.'
        );
      } else {
        failureCount += 1;
        updateForm(candidateId, {
          isSubmitting: false,
          message: describeResponseError(result.reason),
          messageKind: 'error',
        });
      }
    });

    setIsBulkSubmitting(false);
    setBulkMessage({
      text:
        failureCount === 0
          ? `후보 ${successCount}개의 의견을 저장했습니다.`
          : `후보 ${successCount}개는 저장했고 ${failureCount}개는 저장하지 못했습니다. 실패한 후보의 입력은 유지됩니다.`,
      kind: failureCount === 0 ? 'success' : 'error',
    });
    if (successCount > 0 || results.some((result) => result.status === 'rejected' && result.reason instanceof RoomApiError && result.reason.code === 'CANDIDATE_VERSION_CONFLICT')) {
      await onRoomRefresh();
    }
  }

  function saveQuickResponses() {
    if (!fastAvailabilityStatus || !fastTravelBurden) {
      setBulkMessage({
        text: '모든 후보에 저장하려면 참석 가능 여부와 이동 부담을 모두 선택해 주세요.',
        kind: 'error',
      });
      return;
    }

    void saveAllResponses({
      availabilityStatus: fastAvailabilityStatus,
      travelBurden: fastTravelBurden,
    });
  }

  return (
    <section aria-labelledby='candidate-responses-heading' className='space-y-3 sm:space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:items-end sm:gap-x-6'>
        <div>
          <h2 className='text-xl font-extrabold tracking-tight sm:text-2xl' id='candidate-responses-heading'>
            어디가 괜찮아요?
          </h2>
          {!isReadOnly && activeCandidates.length > 0 && (
            <p className='mt-1 hidden text-sm text-[var(--mp-muted)] sm:block'>갈 수 있는 시간과 이동 부담을 알려 주세요.</p>
          )}
        </div>
        {!isReadOnly && activeCandidates.length > 0 && (
          <div className='space-y-1'>
            <p className='text-sm font-medium text-[var(--mp-muted)]'>내 의견 {savedCount}/{activeCandidates.length}개</p>
            <progress aria-label='내 의견 저장 진행률' className='mp-progress max-w-56' max={activeCandidates.length} value={savedCount} />
          </div>
        )}
        {isReadOnly && (
          <p className='basis-full rounded-xl bg-slate-100 px-3 py-2.5 text-sm leading-5 text-slate-600'>
            현재 방 상태에서는 의견을 수정할 수 없습니다. 계산 중에는 완료를
            기다리고, 확정된 방은 방장이 다시 살펴보기를 시작해야 합니다.
          </p>
        )}
      </div>

      {activeCandidates.length === 0 ? (
        <div className='rounded-2xl border border-dashed border-[var(--mp-line)] bg-[var(--mp-surface)] p-5 text-sm leading-5 text-[var(--mp-muted)]'>
          방장이 후보를 등록하면 이곳에서 의견을 남길 수 있습니다.
        </div>
      ) : (
        <>
          <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            {candidateForms.map(({ candidate, form }) => (
              <CandidateResponseCard
                candidate={candidate}
                condition={condition}
                form={form}
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
                      update
                    ),
                  }))
                }
              />
            ))}
          </div>
          {!isReadOnly && activeCandidates.length > 1 && (
            <button
              className='mp-button mp-button-primary min-h-11 w-full sm:w-auto'
              disabled={isInteractionDisabled || readyToSave.length === 0}
              onClick={() => void saveAllResponses()}
              type='button'
            >
              작성한 의견 한꺼번에 저장{readyToSave.length > 0 ? ` (${readyToSave.length}개)` : ''}
            </button>
          )}
          {!isReadOnly && (
            <details className='mp-card overflow-hidden'>
              <summary className='cursor-pointer px-4 py-3 text-sm font-semibold'>빠른 입력 도구</summary>
              <div className='space-y-3 border-t border-slate-200 p-3'>
                {condition && (
                  <div className='space-y-2'>
                    <button className='mp-button mp-button-secondary' disabled={isInteractionDisabled} onClick={fillFromCondition} type='button'>
                      {Object.values(forms).some((form) => form.autoFill) ? '내 기준으로 다시 채우기' : '내 기준으로 의견 채우기'}
                    </button>
                    <p className='text-xs text-slate-600'>저장된 조건으로 참석 가능 여부만 채웁니다. 선택을 확인한 뒤 저장해 주세요.</p>
                    {fillMessage && <p role='status' className='text-sm text-slate-700'>{fillMessage}</p>}
                  </div>
                )}
                <QuickResponsePanel
                  availabilityStatus={fastAvailabilityStatus}
                  isDisabled={isInteractionDisabled}
                  onAvailabilityChange={setFastAvailabilityStatus}
                  onSave={saveQuickResponses}
                  onTravelChange={setFastTravelBurden}
                  travelBurden={fastTravelBurden}
                />
              </div>
            </details>
          )}
          {bulkMessage && <p className={`text-sm ${messageClassName(bulkMessage.kind)}`} role='status'>{bulkMessage.text}</p>}
        </>
      )}
    </section>
  );
}
