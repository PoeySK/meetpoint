'use client';

import { startCalculation } from '@/entities/calculation';
import type { CalculationPayload } from '@/entities/calculation';
import type { DecisionPayload } from '@/entities/decision';
import type { RoomDetailsResponse } from '@/entities/room';
import {
  CalculationStatus,
  CompletedResult,
  isCalculationRunning,
} from './calculation-result-view';
import {
  DecisionConfirmationPanel,
  useDecisionConfirmation,
} from '@/features/decision-confirmation';
import { RoomApiError } from '@/shared/api/http-client';
import { createClientRequestId } from '@/shared/lib/client-request-id';
import { useEffect, useRef, useState } from 'react';

type CalculationResultPanelProps = {
  roomId: string;
  token: string;
  participantId: string;
  room: RoomDetailsResponse;
  onRoomReload: () => Promise<void>;
  latestScoreResult: CalculationPayload | null;
  decision: DecisionPayload | null;
};

function describeCalculationError(error: unknown) {
  if (error instanceof RoomApiError) {
    if (error.code === 'HOST_ONLY') {
      return '방장만 추천 결과를 만들 수 있습니다.';
    }
    if (error.code === 'CALCULATION_IN_PROGRESS') {
      return '추천 결과를 만드는 중입니다. 끝나면 결과를 보여드릴게요.';
    }
    if (error.code === 'PARTICIPANT_COUNT_OUT_OF_RANGE') {
      return '추천 결과를 만들려면 현재 참여자가 3~6명이어야 합니다.';
    }
    if (error.code === 'NO_ACTIVE_CANDIDATES') {
      return '추천 결과를 만들려면 후보가 2~5개 필요합니다.';
    }
    if (error.code === 'ROOM_STATE_CONFLICT') {
      return '지금은 추천 결과를 만들 수 없습니다.';
    }
    if (error.code === 'TOKEN_EXPIRED' || error.code === 'INVALID_TOKEN') {
      return '방 입장 정보가 만료되었습니다. 방에 다시 입장해 주세요.';
    }
  }

  return '추천 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

const isRunning = isCalculationRunning;

export function CalculationResultPanel({
  roomId,
  token,
  participantId,
  room,
  onRoomReload,
  latestScoreResult,
  decision: loadedDecision,
}: CalculationResultPanelProps) {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null
  );
  const calculation = latestScoreResult;
  const isLoadingResult =
    isStarting || (room.room.status === 'CALCULATING' && !calculation);
  const calculationVersion = calculation
    ? `${calculation.id}:${calculation.status}`
    : null;
  const defaultCandidateId =
    calculation?.status === 'COMPLETED'
      ? calculation.ranking[0] ?? calculation.candidates[0]?.candidateId ?? null
      : null;
  const previousCalculationVersion = useRef<string | null>(null);
  const isHost = participantId === room.room.hostParticipantId;

  const {
    decision,
    decisionError,
    decisionNotice,
    acknowledgeIssues,
    setAcknowledgeIssues,
    decisionNote,
    setDecisionNote,
    isConfirming,
    reopenReason,
    setReopenReason,
    isReopening,
    handleConfirm,
    handleReopen,
    resetDecisionDraft,
    selectedCandidate,
    selectedCandidateHasIssues,
    coverageIsComplete,
  } = useDecisionConfirmation({
    calculation,
    decision: loadedDecision,
    onRoomReload,
    room,
    roomId,
    selectedCandidateId,
    token,
  });

  useEffect(() => {
    if (previousCalculationVersion.current !== calculationVersion) {
      setSelectedCandidateId(defaultCandidateId);
      resetDecisionDraft();
    }
    previousCalculationVersion.current = calculationVersion;
  }, [calculationVersion, defaultCandidateId, resetDecisionDraft]);

  async function handleStart() {
    setIsStarting(true);
    setError(null);
    setSelectedCandidateId(null);
    resetDecisionDraft();

    try {
      await startCalculation(roomId, token, createClientRequestId());
      await onRoomReload();
    } catch (requestError) {
      setError(describeCalculationError(requestError));
    } finally {
      setIsStarting(false);
    }
  }

  function handleSelectCandidate(candidateId: string) {
    setSelectedCandidateId(candidateId);
    resetDecisionDraft();
  }

  return (
    <section className='mp-card mp-card-raised p-4 sm:p-6'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div className='space-y-1.5'>
          <p className='text-sm font-semibold text-emerald-700'>추천 결과</p>
          <h2 className='text-xl font-semibold tracking-tight text-slate-950'>
            모임 추천 결과
          </h2>
          <p className='text-sm leading-6 text-slate-500'>
            입력한 기준과 후보별 의견을 함께 살펴 예산·시간·선호·이동 부담을
            비교합니다. 기준을 입력하지 않은 사람도 의견을 남길 수 있습니다.
          </p>
        </div>
        {isHost && (
          <button
            className='mp-button mp-button-primary'
            disabled={
              isStarting ||
              isRunning(calculation?.status) ||
              room.room.status === 'CALCULATING' ||
              room.room.status === 'CONFIRMED'
            }
            onClick={() => void handleStart()}
            type='button'
          >
            {isStarting || isRunning(calculation?.status)
              ? '결과 만드는 중...'
              : '추천 결과 만들기'}
          </button>
        )}
      </div>

      {error && (
        <div className='mt-4 flex flex-col gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-700 sm:flex-row sm:items-center sm:justify-between'>
          <span>{error}</span>
          {isHost && (
            <button
              className='mp-button mp-button-secondary self-start border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:border-rose-300 hover:bg-white sm:self-auto'
              onClick={() => void handleStart()}
              type='button'
            >
              다시 시도
            </button>
          )}
        </div>
      )}
      {isLoadingResult && !calculation && (
        <div className='mt-4 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600'>
          <span className='h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600' />
          추천 결과를 불러오는 중입니다.
        </div>
      )}

      {!room.room.latestScoreResultId && !isLoadingResult && !error && (
        <p className='mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm leading-5 text-slate-600'>
          아직 추천 결과가 없습니다. 참여자가 3명 이상이고 후보가 2개 이상이면
          방장이 결과를 만들 수 있습니다.
        </p>
      )}

      {calculation && (
        <div className='mt-4 space-y-4'>
          <CalculationStatus calculation={calculation} />
          <CompletedResult
            calculation={calculation}
            isHost={isHost}
            onSelectCandidate={handleSelectCandidate}
            room={room}
            selectedCandidateId={selectedCandidateId}
          />
        </div>
      )}

      <DecisionConfirmationPanel
        acknowledgeIssues={acknowledgeIssues}
        calculation={calculation}
        coverageIsComplete={coverageIsComplete}
        decision={decision}
        decisionError={decisionError}
        decisionNotice={decisionNotice}
        decisionNote={decisionNote}
        isConfirming={isConfirming}
        isHost={isHost}
        isReopening={isReopening}
        onAcknowledgeIssuesChange={setAcknowledgeIssues}
        onConfirm={() => void handleConfirm()}
        onDecisionNoteChange={setDecisionNote}
        onReopen={() => void handleReopen()}
        onReopenReasonChange={setReopenReason}
        reopenReason={reopenReason}
        roomStatus={room.room.status}
        selectedCandidate={selectedCandidate}
        selectedCandidateHasIssues={selectedCandidateHasIssues}
        selectedCandidateName={
          selectedCandidate
            ? (room.candidates.find(
                (candidate) => candidate.id === selectedCandidate.candidateId
              )?.place.name ?? null)
            : null
        }
      />
    </section>
  );
}
