"use client";

import { useEffect, useState } from "react";
import {
  getCalculation,
  RoomApiError,
  startCalculation,
  type CalculationPayload,
  type MatchLevel,
  type RecommendationStatus,
  type RoomDetailsResponse,
  type ScoringProfile,
} from "@/lib/rooms";

type CalculationResultPanelProps = {
  roomId: string;
  token: string;
  participantId: string;
  room: RoomDetailsResponse;
};

function createClientRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `client-${crypto.randomUUID()}`;
  }

  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const matchLevelLabels: Record<MatchLevel, string> = {
  FULL: "완전 일치",
  PARTIAL: "부분 일치",
  CONFLICTED: "충돌 있음",
  INCOMPLETE: "응답 부족",
};

const recommendationStatusLabels: Record<RecommendationStatus, string> = {
  INCOMPLETE: "응답 부족",
  FULL_MATCH: "완전 일치 후보 있음",
  PARTIAL_MATCH: "부분 일치 후보 있음",
  NO_FULL_MATCH: "완전 일치 후보 없음",
};

const scoringProfileLabels: Record<ScoringProfile, string> = {
  MVP_NO_CONDITIONS: "조건 없는 MVP",
};

const calculationCodeLabels: Record<string, string> = {
  LOW_SCORE: "낮은 점수",
  MISSING_RESPONSE: "미응답",
  MAYBE_RESPONSE: "참여 가능 여부 보류",
  NO_FULL_MATCH: "완전 일치 후보 없음",
  SELF_REPORTED_TRAVEL_BURDEN: "참여자가 입력한 이동 부담",
  SOLVER_ERROR: "계산 서버 오류",
  SOLVER_UNAVAILABLE: "계산 서버에 연결할 수 없음",
  TIME_UNAVAILABLE: "시간 불가",
  TRAVEL_BURDEN_HARD: "이동 부담 높음",
  TRAVEL_BURDEN_UNCERTAIN: "이동 부담 보통",
};

function getCalculationCodeLabel(code: string) {
  return calculationCodeLabels[code] ?? "추가 확인 필요";
}

function describeCalculationError(error: unknown) {
  if (error instanceof RoomApiError) {
    if (error.code === "HOST_ONLY") {
      return "호스트만 계산을 시작할 수 있습니다.";
    }
    if (error.code === "CALCULATION_IN_PROGRESS") {
      return "이미 계산이 진행 중입니다. 완료되면 이곳에 결과가 표시됩니다.";
    }
    if (error.code === "PARTICIPANT_COUNT_OUT_OF_RANGE") {
      return "계산하려면 활성 참여자가 3~6명 필요합니다.";
    }
    if (error.code === "NO_ACTIVE_CANDIDATES") {
      return "계산하려면 활성 후보가 2~5개 필요합니다.";
    }
    if (error.code === "ROOM_STATE_CONFLICT") {
      return "현재 방 상태에서는 새 계산을 시작할 수 없습니다.";
    }
    if (error.code === "TOKEN_EXPIRED" || error.code === "INVALID_TOKEN") {
      return "방 접근 토큰이 유효하지 않습니다. 방에 다시 입장해 주세요.";
    }
  }

  return "계산 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function isRunning(status: CalculationPayload["status"] | undefined) {
  return status === "REQUESTED" || status === "RUNNING";
}

function CalculationStatus({ calculation }: { calculation: CalculationPayload }) {
  if (calculation.status === "RUNNING" || calculation.status === "REQUESTED") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-200 border-t-amber-700" />
        계산 중입니다. 완료되면 자동으로 업데이트됩니다.
      </div>
    );
  }

  if (calculation.status === "FAILED") {
    return (
      <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
        {calculation.error
          ? getCalculationCodeLabel(calculation.error.code)
          : "계산 서버가 계산을 완료하지 못했습니다."}
        {calculation.error?.retryable && " 다시 계산할 수 있습니다."}
      </div>
    );
  }

  if (calculation.status === "STALE") {
    return (
      <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-700">
        방 정보가 변경되어 이 결과는 최신 상태가 아닙니다. 새로 계산해 주세요.
      </div>
    );
  }

  return null;
}

function CompletedResult({
  calculation,
  room,
}: {
  calculation: CalculationPayload;
  room: RoomDetailsResponse;
}) {
  if (calculation.status !== "COMPLETED") {
    return null;
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            추천 상태
          </p>
          <p className="mt-1 font-semibold text-slate-950">
            {calculation.recommendationStatus
              ? recommendationStatusLabels[calculation.recommendationStatus]
              : "-"}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            응답 현황
          </p>
          <p className="mt-1 font-semibold text-slate-950">
            {calculation.coverage.submittedResponses}/
            {calculation.coverage.expectedResponses}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            계산 프로필
          </p>
          <p className="mt-1 font-semibold text-slate-950">
            {scoringProfileLabels[calculation.metadata.scoringProfile]}
          </p>
        </div>
      </div>

      {calculation.recommendationWarnings.length > 0 && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          주의: {calculation.recommendationWarnings
            .map(getCalculationCodeLabel)
            .join(", ")}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {calculation.candidates.map((candidate) => {
          const roomCandidate = room.candidates.find(
            (item) => item.id === candidate.candidateId,
          );

          return (
            <article
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              key={candidate.candidateId}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    {candidate.rank}순위
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">
                    {roomCandidate?.place.name ?? candidate.candidateId}
                  </h3>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-950">
                    {candidate.overallScore.toFixed(1)}
                  </p>
                  <p className="text-xs font-semibold text-slate-500">
                    {matchLevelLabels[candidate.matchLevel]}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                <span
                  className={`rounded-full px-2.5 py-1 ${
                    candidate.eligible
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {candidate.eligible ? "추천 가능" : "확인이 필요합니다"}
                </span>
                {candidate.explanationFlags.map((flag) => (
                  <span
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600"
                    key={flag}
                  >
                    {getCalculationCodeLabel(flag)}
                  </span>
                ))}
              </div>

              {candidate.blockingIssues.length > 0 && (
                <p className="mt-4 text-sm text-rose-700">
                  {candidate.blockingIssues
                    .map(getCalculationCodeLabel)
                    .join(", ")}
                </p>
              )}
              {candidate.conflicts.length > 0 && (
                <p className="mt-2 text-sm text-rose-700">
                  충돌: {candidate.conflicts
                    .map((conflict) => getCalculationCodeLabel(conflict.code))
                    .join(", ")}
                </p>
              )}

              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                {candidate.participantBreakdown.map((participant) => (
                  <div
                    className="flex items-center justify-between gap-3 text-sm"
                    key={participant.participantId}
                  >
                    <span className="text-slate-600">
                      {room.participants.find(
                        (item) => item.id === participant.participantId,
                      )?.displayName ?? participant.participantId}
                    </span>
                    <span className="font-semibold text-slate-950">
                      {participant.score.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function CalculationResultPanel({
  roomId,
  token,
  participantId,
  room,
}: CalculationResultPanelProps) {
  const [calculationId, setCalculationId] = useState<string | null>(
    room.room.latestScoreResultId,
  );
  const [calculation, setCalculation] = useState<CalculationPayload | null>(null);
  const [isLoadingResult, setIsLoadingResult] = useState(
    Boolean(room.room.latestScoreResultId),
  );
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHost = participantId === room.room.hostParticipantId;

  useEffect(() => {
    if (calculationId === null) {
      return;
    }
    const activeCalculationId: string = calculationId;

    let isActive = true;
    let timerId: number | undefined;

    async function poll() {
      try {
        const response = await getCalculation(roomId, activeCalculationId, token);
        if (!isActive) {
          return;
        }
        setCalculation(response.calculation);
        setError(null);
        setIsLoadingResult(false);
        if (isRunning(response.calculation.status)) {
          timerId = window.setTimeout(() => void poll(), 1000);
        }
      } catch (requestError) {
        if (!isActive) {
          return;
        }
        setError(describeCalculationError(requestError));
        setIsLoadingResult(false);
      }
    }

    void poll();

    return () => {
      isActive = false;
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
    };
  }, [calculationId, roomId, token]);

  async function handleStart() {
    setIsStarting(true);
    setError(null);
    setCalculation(null);
    setIsLoadingResult(true);

    try {
      const response = await startCalculation(
        roomId,
        token,
        createClientRequestId(),
      );
      setCalculationId(response.calculation.id);
    } catch (requestError) {
      setIsLoadingResult(false);
      setError(describeCalculationError(requestError));
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/50 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
          <p className="text-sm font-semibold text-emerald-700">계산 결과</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
            후보 추천 계산
          </h2>
          <p className="text-sm leading-6 text-slate-500">
            참여 가능 여부와 이동 부담을 기준으로 계산합니다. 예산과 선호도는
            제한 없음으로 처리합니다.
          </p>
        </div>
        {isHost && (
          <button
            className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={isStarting || isRunning(calculation?.status) || room.room.status === "CALCULATING"}
            onClick={() => void handleStart()}
            type="button"
          >
            {isStarting || isRunning(calculation?.status)
              ? "계산 중..."
              : "계산 시작"}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-5 flex flex-col gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          {isHost && (
            <button
              className="self-start rounded-lg border border-rose-200 px-3 py-1.5 font-semibold text-rose-700 hover:bg-white sm:self-auto"
              onClick={() => void handleStart()}
              type="button"
            >
              다시 시도
            </button>
          )}
        </div>
      )}

      {isLoadingResult && !calculation && (
        <div className="mt-5 flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600" />
          계산 결과를 불러오는 중...
        </div>
      )}

      {!calculationId && !isLoadingResult && !error && (
        <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
          아직 계산 결과가 없습니다. 참여자가 3명 이상이고 후보가 2개 이상이면
          호스트가 계산을 시작할 수 있습니다.
        </p>
      )}

      {calculation && (
        <div className="mt-5 space-y-5">
          <CalculationStatus calculation={calculation} />
          <CompletedResult calculation={calculation} room={room} />
        </div>
      )}
    </section>
  );
}
