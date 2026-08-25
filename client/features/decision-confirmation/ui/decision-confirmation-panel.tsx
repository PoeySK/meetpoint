import type { CalculationPayload, ScoreResultCandidate } from "@/entities/calculation";
import type { DecisionPayload } from "@/entities/decision";
import type { RoomStatus } from "@/entities/room";

type DecisionConfirmationPanelProps = {
  calculation: CalculationPayload | null;
  coverageIsComplete: boolean;
  decision: DecisionPayload | null;
  decisionError: string | null;
  decisionNotice: string | null;
  decisionNote: string;
  isConfirming: boolean;
  isHost: boolean;
  isReopening: boolean;
  onConfirm: () => void;
  onDecisionNoteChange: (value: string) => void;
  onReopen: () => void;
  onReopenReasonChange: (value: string) => void;
  reopenReason: string;
  roomStatus: RoomStatus;
  selectedCandidate: ScoreResultCandidate | undefined;
  selectedCandidateHasIssues: boolean;
  selectedCandidateName: string | null;
  acknowledgeIssues: boolean;
  onAcknowledgeIssuesChange: (value: boolean) => void;
};

export function DecisionConfirmationPanel({
  acknowledgeIssues,
  calculation,
  coverageIsComplete,
  decision,
  decisionError,
  decisionNotice,
  decisionNote,
  isConfirming,
  isHost,
  isReopening,
  onAcknowledgeIssuesChange,
  onConfirm,
  onDecisionNoteChange,
  onReopen,
  onReopenReasonChange,
  reopenReason,
  roomStatus,
  selectedCandidate,
  selectedCandidateHasIssues,
  selectedCandidateName,
}: DecisionConfirmationPanelProps) {
  return (
    <>
      {decision && (
        <section
          aria-labelledby="decision-summary-heading"
          className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/55 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-emerald-700">Decision</p>
              <h3
                className="mt-1 text-lg font-semibold text-slate-950"
                id="decision-summary-heading"
              >
                {decision.status === "CONFIRMED"
                  ? "호스트가 후보를 확정했습니다"
                  : "확정 결과를 재검토하는 중입니다"}
              </h3>
            </div>
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
              {decision.status === "CONFIRMED" ? "확정됨" : "재검토 중"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white/80 p-3">
              <p className="text-xs text-slate-500">확정 후보</p>
              <p className="mt-1 font-semibold text-slate-950">
                {decision.candidate.place.name}
              </p>
            </div>
            <div className="rounded-xl bg-white/80 p-3">
              <p className="text-xs text-slate-500">확정 당시 점수</p>
              <p className="mt-1 font-semibold text-slate-950">
                {decision.overallScore.toFixed(1)}
              </p>
            </div>
            <div className="rounded-xl bg-white/80 p-3">
              <p className="text-xs text-slate-500">결정 메모</p>
              <p className="mt-1 text-sm leading-5 text-slate-700">
                {decision.decisionNote ?? "없음"}
              </p>
            </div>
          </div>
          {decision.status === "REOPENED" && (
            <p className="mt-4 text-sm leading-6 text-amber-800">
              {decision.reopenReason ?? "재검토 사유가 기록되었습니다."} 후보 또는 응답을 변경한 뒤 다시 계산해야 새 결정을 확정할 수 있습니다.
            </p>
          )}
          {decision.status === "CONFIRMED" && isHost && (
            <div className="mt-5 border-t border-emerald-100 pt-5">
              <label className="block space-y-2 text-sm font-semibold text-slate-800">
                재검토 사유
                <textarea
                  className="mp-input min-h-20 resize-y"
                  disabled={isReopening}
                  maxLength={300}
                  onChange={(event) => onReopenReasonChange(event.target.value)}
                  placeholder="다시 비교해야 하는 이유를 입력해 주세요."
                  value={reopenReason}
                />
              </label>
              <button
                className="mp-button mp-button-secondary mt-3 text-sm hover:border-slate-700 hover:text-slate-950 disabled:opacity-60"
                disabled={isReopening}
                onClick={onReopen}
                type="button"
              >
                {isReopening ? "재검토 시작 중..." : "확정 결과 재검토"}
              </button>
            </div>
          )}
        </section>
      )}

      {decisionNotice && (
        <p
          aria-live="polite"
          className="mt-4 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm leading-5 text-emerald-700"
        >
          {decisionNotice}
        </p>
      )}
      {decisionError && (
        <p
          aria-live="polite"
          className="mt-4 rounded-xl bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-700"
        >
          {decisionError}
        </p>
      )}

      {calculation?.status === "COMPLETED" &&
        isHost &&
        roomStatus === "CALCULATED" &&
        decision?.status !== "CONFIRMED" && (
          <section
            aria-labelledby="decision-form-heading"
            className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
          >
            <p className="text-sm font-semibold text-emerald-700">호스트 결정</p>
            <h3
              className="mt-1 text-lg font-semibold text-slate-950"
              id="decision-form-heading"
            >
              후보를 선택하고 명시적으로 확정해 주세요.
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              순위가 높은 후보를 자동으로 선택하거나 확정하지 않습니다. 선택한 계산 결과만 Server에 전달합니다.
            </p>

            {!selectedCandidate && (
              <p className="mt-3 rounded-xl bg-white px-3 py-2.5 text-sm text-slate-600">
                후보 카드의 “이 후보 선택” 버튼을 먼저 눌러 주세요.
              </p>
            )}

            {selectedCandidate && calculation && (
              <div className="mt-3 space-y-3 rounded-xl bg-white p-3.5">
                <p className="text-sm text-slate-700">
                  선택 후보: <strong>{selectedCandidateName ?? selectedCandidate.candidateId}</strong>
                </p>
                {!coverageIsComplete && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
                    응답 {calculation.coverage.submittedResponses}/
                    {calculation.coverage.expectedResponses}개가 저장되어 확정할 수 없습니다.
                  </p>
                )}
                {selectedCandidateHasIssues && (
                  <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
                    <input
                      checked={acknowledgeIssues}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
                      onChange={(event) =>
                        onAcknowledgeIssuesChange(event.target.checked)
                      }
                      type="checkbox"
                    />
                    <span>선택 후보의 이슈와 계산 근거를 확인했습니다.</span>
                  </label>
                )}
                <label className="block space-y-2 text-sm font-semibold text-slate-800">
                  결정 메모 {selectedCandidateHasIssues ? "(필수)" : "(선택)"}
                  <textarea
                    className="mp-input min-h-20 resize-y"
                    disabled={isConfirming}
                    maxLength={300}
                    onChange={(event) => onDecisionNoteChange(event.target.value)}
                    placeholder={
                      selectedCandidateHasIssues
                        ? "이슈를 확인한 이유를 1~300자로 입력해 주세요."
                        : "확정 이유를 남길 수 있습니다."
                    }
                    value={decisionNote}
                  />
                  <span className="block text-xs font-normal text-slate-500">
                    {decisionNote.length}/300
                  </span>
                </label>
                <button
                  className="mp-button mp-button-primary w-full"
                  disabled={
                    isConfirming ||
                    !coverageIsComplete ||
                    (selectedCandidateHasIssues &&
                      (!acknowledgeIssues || !decisionNote.trim()))
                  }
                  onClick={onConfirm}
                  type="button"
                >
                  {isConfirming ? "후보 확정 중..." : "선택한 후보 확정"}
                </button>
              </div>
            )}
          </section>
        )}
    </>
  );
}
