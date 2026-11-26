import type { CalculationPayload, ScoreResultCandidate } from "@/entities/calculation";
import type { Candidate } from "@/entities/candidate";
import type { DecisionPayload } from "@/entities/decision";
import type { RoomStatus } from "@/entities/room";
import { useRef } from "react";
import { DecisionSchedule } from "./decision-schedule";

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
  onConfirm: () => Promise<true | undefined>;
  onDecisionNoteChange: (value: string) => void;
  onReopen: () => void;
  onReopenReasonChange: (value: string) => void;
  reopenReason: string;
  roomStatus: RoomStatus;
  selectedCandidate: ScoreResultCandidate | undefined;
  selectedCandidateHasIssues: boolean;
  selectedSchedule: Candidate | undefined;
  acknowledgeIssues: boolean;
  onAcknowledgeIssuesChange: (value: boolean) => void;
};

function DecisionReview({
  candidate,
  disabled,
  error,
  isConfirming,
  onConfirm,
}: {
  candidate: Candidate;
  disabled: boolean;
  error: string | null;
  isConfirming: boolean;
  onConfirm: DecisionConfirmationPanelProps["onConfirm"];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  async function confirmSchedule() {
    if (disabled) return;
    if (await onConfirm()) dialogRef.current?.close();
  }

  return (
    <>
      <button
        aria-haspopup="dialog"
        className="mp-button mp-button-accent min-h-11 w-full rounded-lg"
        disabled={disabled}
        onClick={() => dialogRef.current?.showModal()}
        type="button"
      >
        확정 전 일정 확인
      </button>
      <dialog
        aria-labelledby="decision-review-heading"
        className="mp-dialog max-w-md p-4 sm:p-6"
        onCancel={(event) => { if (isConfirming) event.preventDefault(); }}
        ref={dialogRef}
      >
        <h2 className="text-xl font-bold tracking-tight" id="decision-review-heading">이 일정으로 확정할까요?</h2>
        <p className="mt-1.5 break-keep text-sm leading-5 text-slate-600">
          확정하면 방장과 참가자 모두 이 일정을 보게 됩니다.
        </p>
        <div className="my-4 rounded-lg border border-stone-200 bg-stone-50 p-3.5 sm:p-4">
          <DecisionSchedule candidate={candidate} />
        </div>
        {error && <p className="mb-3 text-sm leading-5 text-rose-700" role="alert">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            autoFocus
            className="mp-button mp-button-secondary min-h-11 rounded-lg"
            disabled={isConfirming}
            onClick={() => dialogRef.current?.close()}
            type="button"
          >
            돌아가기
          </button>
          <button
            className="mp-button mp-button-accent min-h-11 rounded-lg"
            disabled={disabled}
            onClick={() => void confirmSchedule()}
            type="button"
          >
            {isConfirming ? "일정을 확정하는 중…" : "일정 확정"}
          </button>
        </div>
      </dialog>
    </>
  );
}

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
  selectedSchedule,
}: DecisionConfirmationPanelProps) {
  const scheduleAtTop = roomStatus === "CONFIRMED" && decision?.status === "CONFIRMED";

  return (
    <>
      {decision && (
        <section
          aria-labelledby="decision-summary-heading"
          className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">확정 결과</p>
              <h3
                className="mt-1 text-lg font-semibold text-slate-950"
                id="decision-summary-heading"
              >
                {scheduleAtTop
                  ? "확정 근거와 메모"
                  : decision.status === "CONFIRMED"
                    ? "방장이 일정을 확정했습니다"
                    : "확정 내용을 다시 검토하는 중입니다"}
              </h3>
            </div>
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
              {decision.status === "CONFIRMED" ? "일정 확정" : "재검토 중"}
            </span>
          </div>
          {scheduleAtTop ? (
            <a className="mt-3 inline-block text-sm font-semibold text-slate-700 underline" href="#room-confirmed-schedule">
              확정 일정 보기
            </a>
          ) : (
            <div className="mt-4 rounded-xl bg-white/80 p-3">
              <DecisionSchedule candidate={decision.candidate} />
            </div>
          )}
          <div className="mt-4 grid gap-3 [overflow-wrap:anywhere] sm:grid-cols-2">
            <div className="rounded-xl bg-white/80 p-3">
              <p className="text-xs text-slate-500">추천 당시 점수</p>
              <p className="mt-1 font-semibold text-slate-950">
                {decision.overallScore.toFixed(1)}점
              </p>
            </div>
            <div className="rounded-xl bg-white/80 p-3">
              <p className="text-xs text-slate-500">확정 메모</p>
              <p className="mt-1 text-sm leading-5 text-slate-700">
                {decision.decisionNote ?? "기록 없음"}
              </p>
            </div>
          </div>
          {decision.status === "REOPENED" && (
            <p className="mt-4 text-sm leading-6 text-slate-700">
              <strong>다시 검토하는 이유:</strong>{" "}
              {decision.reopenReason ?? "이유가 기록되었습니다."}
              <br />
              후보나 의견을 바꾼 뒤
              추천 결과를 다시 만들어야 새 일정을 확정할 수 있습니다.
            </p>
          )}
          {decision.status === "CONFIRMED" && isHost && (
            <div className="mt-5 border-t border-slate-200 pt-5">
              <label className="block space-y-2 text-sm font-semibold text-slate-800">
                다시 검토하는 이유
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
                {isReopening ? "다시 검토하는 중..." : "확정 내용 다시 검토하기"}
              </button>
            </div>
          )}
        </section>
      )}

      {decisionNotice && (
        <p
          aria-live="polite"
          className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm leading-5 text-slate-700"
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
            <p className="text-sm font-semibold text-slate-700">최종 일정 확정</p>
            <h3
              className="mt-1 text-lg font-semibold text-slate-950"
              id="decision-form-heading"
            >
              후보를 선택한 뒤 일정을 확정해 주세요.
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              추천 1순위는 참고용으로 미리 선택되어 있습니다. 확인할 점을 살펴본 뒤 직접 확정해 주세요.
            </p>

            {!selectedCandidate && (
              <p className="mt-3 rounded-xl bg-white px-3 py-2.5 text-sm text-slate-600">
                후보 카드에서 “이 후보 선택”을 눌러 주세요.
              </p>
            )}

            {selectedCandidate && calculation && (
              <div className="mt-3 space-y-3 rounded-xl bg-white p-3.5">
                <p className="text-sm text-slate-700">
                  선택한 후보: <strong>{selectedSchedule?.place.name ?? "후보 정보를 불러오지 못했습니다"}</strong>
                </p>
                {!coverageIsComplete && (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                    응답 {calculation.coverage.submittedResponses}개 /
                    전체 {calculation.coverage.expectedResponses}개가 저장되어야 일정을 확정할 수 있습니다.
                  </p>
                )}
                {selectedCandidateHasIssues && (
                  <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
                    <input
                      checked={acknowledgeIssues}
                      className="mt-1 size-4 shrink-0 accent-[var(--mp-purple)]"
                      onChange={(event) =>
                        onAcknowledgeIssuesChange(event.target.checked)
                      }
                      type="checkbox"
                    />
                    <span>선택한 후보의 확인할 점과 추천 근거를 확인했습니다.</span>
                  </label>
                )}
                <label className="block space-y-2 text-sm font-semibold text-slate-800">
                  확정 메모 {selectedCandidateHasIssues ? "(필수)" : "(선택)"}
                  <textarea
                    className="mp-input min-h-20 resize-y"
                    disabled={isConfirming}
                    maxLength={300}
                    onChange={(event) => onDecisionNoteChange(event.target.value)}
                    placeholder={
                      selectedCandidateHasIssues
                        ? "확인한 내용이나 이 후보를 선택한 이유를 1~300자로 입력해 주세요."
                        : "이 후보를 선택한 이유를 남길 수 있습니다."
                    }
                    value={decisionNote}
                  />
                  <span className="block text-xs font-normal text-slate-500">
                    {decisionNote.length}/300
                  </span>
                </label>
                {selectedSchedule && (
                  <DecisionReview
                    candidate={selectedSchedule}
                    disabled={
                      isConfirming ||
                      !coverageIsComplete ||
                      (selectedCandidateHasIssues &&
                        (!acknowledgeIssues || !decisionNote.trim()))
                    }
                    error={decisionError}
                    isConfirming={isConfirming}
                    key={`${calculation.id}:${selectedSchedule.id}:${selectedSchedule.version}`}
                    onConfirm={onConfirm}
                  />
                )}
              </div>
            )}
          </section>
        )}
    </>
  );
}
