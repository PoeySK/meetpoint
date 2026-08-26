import type {
  CalculationPayload,
  MatchLevel,
  RecommendationStatus,
  ScoringProfile,
} from "@/entities/calculation";
import type { RoomDetailsResponse } from "@/entities/room";

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
  CONDITION_AWARE: "참여자 조건 반영 계산",
  MVP_NO_CONDITIONS: "조건 없는 기본 계산",
};

const calculationCodeLabels: Record<string, string> = {
  LOW_SCORE: "낮은 점수",
  MISSING_RESPONSE: "미응답",
  MAYBE_RESPONSE: "가능 여부 불확실",
  NO_FULL_MATCH: "완전 일치 후보 없음",
  SELF_REPORTED_TRAVEL_BURDEN: "참여자 자기 평가 이동 부담",
  SOLVER_ERROR: "계산 서버 오류",
  SOLVER_UNAVAILABLE: "계산 서버 연결 실패",
  TIME_UNAVAILABLE: "시간 불가",
  TRAVEL_BURDEN_HARD: "이동 부담 높음",
  TRAVEL_BURDEN_UNCERTAIN: "이동 부담 불확실",
  TIME_CONDITION_CONFLICT: "가능 시간과 후보 시간 충돌",
  BUDGET_LIMIT_EXCEEDED: "예산 초과",
  REQUIRED_TAG_MISSING: "필수 태그 누락",
  AVOID_TAG_PRESENT: "피하고 싶은 태그 포함",
  NO_BUDGET_CONSTRAINT: "예산 제한 없음",
};

export function getCalculationCodeLabel(code: string) {
  return calculationCodeLabels[code] ?? "추가 확인 필요";
}

export function isCalculationRunning(
  status: CalculationPayload["status"] | undefined,
) {
  return status === "REQUESTED" || status === "RUNNING";
}

export function CalculationStatus({
  calculation,
}: {
  calculation: CalculationPayload;
}) {
  if (isCalculationRunning(calculation.status)) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-200 border-t-amber-700" />
        계산 중입니다. 완료되면 자동으로 갱신합니다.
      </div>
    );
  }

  if (calculation.status === "FAILED") {
    return (
      <div className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-700">
        {calculation.error
          ? getCalculationCodeLabel(calculation.error.code)
          : "계산이 완료되지 않았습니다."}
        {calculation.error?.retryable && " 다시 계산할 수 있습니다."}
      </div>
    );
  }

  if (calculation.status === "STALE") {
    return (
      <div className="rounded-xl bg-slate-100 px-3 py-2.5 text-sm leading-5 text-slate-700">
        방 정보가 변경되어 이 결과는 최신 상태가 아닙니다. 다시 계산해 주세요.
      </div>
    );
  }

  return null;
}

export function CompletedResult({
  calculation,
  room,
  isHost,
  selectedCandidateId,
  onSelectCandidate,
}: {
  calculation: CalculationPayload;
  room: RoomDetailsResponse;
  isHost: boolean;
  selectedCandidateId: string | null;
  onSelectCandidate: (candidateId: string) => void;
}) {
  if (calculation.status !== "COMPLETED") {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            추천 상태
          </p>
          <p className="mt-1 font-semibold text-slate-950">
            {calculation.recommendationStatus
              ? recommendationStatusLabels[calculation.recommendationStatus]
              : "-"}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            응답 현황
          </p>
          <p className="mt-1 font-semibold text-slate-950">
            {calculation.coverage.submittedResponses}/
            {calculation.coverage.expectedResponses}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            계산 프로필
          </p>
          <p className="mt-1 font-semibold text-slate-950">
            {scoringProfileLabels[calculation.metadata.scoringProfile]}
          </p>
        </div>
      </div>

      {calculation.recommendationWarnings.length > 0 && (
        <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          주의: {calculation.recommendationWarnings
            .map(getCalculationCodeLabel)
            .join(", ")}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {calculation.candidates.map((candidate) => {
          const roomCandidate = room.candidates.find(
            (item) => item.id === candidate.candidateId,
          );
          const isSelected = selectedCandidateId === candidate.candidateId;
          const selectionClassName = isSelected
            ? "mp-button mt-4 w-full border border-emerald-700 bg-emerald-700 px-3 py-2.5 text-sm text-white hover:bg-emerald-800"
            : "mp-button mp-button-secondary mt-4 w-full px-3 py-2.5 text-sm hover:border-emerald-500 hover:text-emerald-700";

          return (
            <article
              className="mp-card rounded-xl p-4 shadow-none"
              key={candidate.candidateId}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    {candidate.rank}순위
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">
                    {roomCandidate?.place.name ?? "후보 정보를 확인할 수 없습니다"}
                  </h3>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-slate-950">
                    {candidate.overallScore.toFixed(1)}
                  </p>
                  <p className="text-xs font-semibold text-slate-500">
                    {matchLevelLabels[candidate.matchLevel]}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                <span
                  className={
                    candidate.eligible
                      ? "rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700"
                      : "rounded-full bg-rose-50 px-2.5 py-1 text-rose-700"
                  }
                >
                  {candidate.eligible ? "추천 가능" : "확인 필요"}
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

              <p className="mt-4 text-sm text-slate-600">
                후보 응답 coverage: {candidate.coverage.submittedResponses}/
                {candidate.coverage.expectedResponses}
              </p>

              {candidate.blockingIssues.length > 0 && (
                <p className="mt-4 text-sm text-rose-700">
                  {candidate.blockingIssues.map(getCalculationCodeLabel).join(", ")}
                </p>
              )}
              {candidate.conflicts.length > 0 && (
                <p className="mt-2 text-sm text-rose-700">
                  충돌: {candidate.conflicts
                    .map((conflict) => getCalculationCodeLabel(conflict.code))
                    .join(", ")}
                </p>
              )}

              {candidate.reasons.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm leading-6 text-slate-600">
                  {candidate.reasons.map((reason) => (
                    <li key={reason}>· {reason}</li>
                  ))}
                </ul>
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

              {isHost && room.room.status === "CALCULATED" && (
                <button
                  aria-pressed={isSelected}
                  className={selectionClassName}
                  onClick={() => onSelectCandidate(candidate.candidateId)}
                  type="button"
                >
                  {isSelected ? "선택된 후보" : "이 후보 선택"}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
