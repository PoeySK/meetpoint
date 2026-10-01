import type {
  CalculationPayload,
  MatchLevel,
  RecommendationStatus,
  ScoringProfile,
} from "@/entities/calculation";
import type { RoomDetailsResponse } from "@/entities/room";

const matchLevelLabels: Record<MatchLevel, string> = {
  FULL: "모두에게 잘 맞음",
  PARTIAL: "일부 조정 필요",
  CONFLICTED: "확인할 충돌 있음",
  INCOMPLETE: "응답 부족",
};

const recommendationStatusLabels: Record<RecommendationStatus, string> = {
  INCOMPLETE: "응답이 더 필요해요",
  FULL_MATCH: "잘 맞는 후보가 있어요",
  PARTIAL_MATCH: "조정하면 가능한 후보가 있어요",
  NO_FULL_MATCH: "모두에게 맞는 후보가 없어요",
};

const scoringProfileLabels: Record<ScoringProfile, string> = {
  CONDITION_AWARE: "입력한 선택 조건 반영",
  MVP_NO_CONDITIONS: "선택 조건 없이 추천",
};

const calculationCodeLabels: Record<string, string> = {
  LOW_SCORE: "점수가 낮아요",
  MISSING_RESPONSE: "아직 응답이 없어요",
  MAYBE_RESPONSE: "참석 여부를 보류했어요",
  NO_FULL_MATCH: "모든 사람에게 맞는 후보가 없어요",
  SELF_REPORTED_TRAVEL_BURDEN: "직접 입력한 이동 부담",
  SOLVER_ERROR: "추천 결과를 만드는 중 문제가 생겼어요",
  SOLVER_UNAVAILABLE: "추천 결과를 잠시 만들 수 없어요",
  TIME_UNAVAILABLE: "참석하기 어려운 시간이에요",
  TRAVEL_BURDEN_HARD: "이동이 많이 부담돼요",
  TRAVEL_BURDEN_UNCERTAIN: "이동 부담을 아직 정하지 않았어요",
  TIME_CONDITION_CONFLICT: "입력한 가능 시간과 후보 시간이 달라요",
  BUDGET_LIMIT_EXCEEDED: "예산을 넘어요",
  REQUIRED_TAG_MISSING: "필수로 고른 특징이 없어요",
  AVOID_TAG_PRESENT: "피하고 싶은 특징이 있어요",
  NO_BUDGET_CONSTRAINT: "예산 제한을 두지 않았어요",
  CONDITION_NOT_PROVIDED: "선택 조건을 입력하지 않았어요",
};

export function getCalculationCodeLabel(code: string) {
  return calculationCodeLabels[code] ?? "추가로 확인할 내용이 있어요";
}

export function getCalculationReasonLabel(reason: string) {
  const normalizedReason = reason.trim();
  const partialMatch = /^(\d+)\/(\d+) responses submitted$/.exec(
    normalizedReason,
  );
  if (partialMatch) {
    return `전체 ${partialMatch[2]}명 중 ${partialMatch[1]}명이 응답했습니다.`;
  }

  const completeMatch = /^(\d+) responses submitted$/.exec(normalizedReason);
  if (completeMatch) {
    return `${completeMatch[1]}명이 모두 응답했습니다.`;
  }

  return /[A-Za-z]/.test(normalizedReason)
    ? "추천 결과를 만드는 데 참고한 내용입니다."
    : normalizedReason;
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
        추천 결과를 준비하고 있습니다. 준비되면 자동으로 보여드릴게요.
      </div>
    );
  }

  if (calculation.status === "FAILED") {
    return (
      <div className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-700">
        {calculation.error
          ? getCalculationCodeLabel(calculation.error.code)
          : "추천 결과를 만들지 못했습니다."}
          {calculation.error?.retryable && " 잠시 후 다시 시도해 주세요."}
      </div>
    );
  }

  if (calculation.status === "STALE") {
    return (
      <div className="rounded-xl bg-slate-100 px-3 py-2.5 text-sm leading-5 text-slate-700">
        후보·참여자·선택 조건·의견이 바뀌어 이 결과는 최신 내용이 아닙니다. 최신 추천 결과를 다시 만들어 주세요.
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
            전체 추천 상태
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
            {calculation.coverage.submittedResponses}개 /
            {calculation.coverage.expectedResponses}개
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            추천에 반영한 내용
          </p>
          <p className="mt-1 font-semibold text-slate-950">
            {scoringProfileLabels[calculation.metadata.scoringProfile]}
          </p>
        </div>
      </div>

      {calculation.recommendationWarnings.length > 0 && (
        <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          확인할 점: {calculation.recommendationWarnings
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
                    {roomCandidate?.place.name ?? "후보 정보를 불러오지 못했습니다"}
                  </h3>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-slate-950">
                    {candidate.overallScore.toFixed(1)}점
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
                  {candidate.eligible ? "추천 가능한 후보" : "확인할 점 있음"}
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
                이 후보에 응답한 사람: {candidate.coverage.submittedResponses}명 /
                {candidate.coverage.expectedResponses}명
              </p>

              {candidate.blockingIssues.length > 0 && (
                <p className="mt-4 text-sm text-rose-700">
                  확정 전에 확인해 주세요: {candidate.blockingIssues.map(getCalculationCodeLabel).join(", ")}
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
                    <li key={reason}>· {getCalculationReasonLabel(reason)}</li>
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
                      {participant.score.toFixed(1)}점
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
                  {isSelected ? "선택한 후보" : "이 후보 선택"}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
