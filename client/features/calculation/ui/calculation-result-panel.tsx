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
      return '호스트만 계산을 시작할 수 있습니다.';
    }
    if (error.code === 'CALCULATION_IN_PROGRESS') {
      return '이미 계산이 진행 중입니다. 완료되면 결과를 표시합니다.';
    }
    if (error.code === 'PARTICIPANT_COUNT_OUT_OF_RANGE') {
      return '계산하려면 활성 참여자가 3~6명이어야 합니다.';
    }
    if (error.code === 'NO_ACTIVE_CANDIDATES') {
      return '계산하려면 활성 후보가 2~5개여야 합니다.';
    }
    if (error.code === 'ROOM_STATE_CONFLICT') {
      return '현재 방 상태에서는 계산을 시작할 수 없습니다.';
    }
    if (error.code === 'TOKEN_EXPIRED' || error.code === 'INVALID_TOKEN') {
      return '방 접근 토큰이 유효하지 않습니다. 방에 다시 입장해 주세요.';
    }
  }

  return '계산 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
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
  const previousCalculationVersion = useRef(calculationVersion);
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
      setSelectedCandidateId(null);
      resetDecisionDraft();
    }
    previousCalculationVersion.current = calculationVersion;
  }, [calculationVersion, resetDecisionDraft]);

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
    <section className='rounded-4xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/50 sm:p-8'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
        <div className='space-y-2'>
          <p className='text-sm font-semibold text-emerald-700'>계산 결과</p>
          <h2 className='text-2xl font-semibold tracking-tight text-slate-950'>
            후보 추천 계산
          </h2>
          <p className='text-sm leading-6 text-slate-500'>
            참여자 응답과 이동 부담 자기 평가를 기준으로 계산합니다. 예산과
            선호는 제한 없음으로 처리합니다.
          </p>
        </div>
        {isHost && (
          <button
            className='rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-300'
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
              ? '계산 중...'
              : '계산 시작'}
          </button>
        )}
      </div>

      {error && (
        <div className='mt-5 flex flex-col gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700 sm:flex-row sm:items-center sm:justify-between'>
          <span>{error}</span>
          {isHost && (
            <button
              className='self-start rounded-lg border border-rose-200 px-3 py-1.5 font-semibold text-rose-700 hover:bg-white sm:self-auto'
              onClick={() => void handleStart()}
              type='button'
            >
              다시 시도
            </button>
          )}
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

      {isLoadingResult && !calculation && (
        <div className='mt-5 flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600'>
          <span className='h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600' />
          계산 결과를 불러오는 중입니다.
        </div>
      )}

      {!room.room.latestScoreResultId && !isLoadingResult && !error && (
        <p className='mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600'>
          아직 계산 결과가 없습니다. 참여자가 3명 이상이고 후보가 2개 이상이면
          호스트가 계산을 시작할 수 있습니다.
        </p>
      )}

      {calculation && (
        <div className='mt-5 space-y-5'>
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
    </section>
  );
}
