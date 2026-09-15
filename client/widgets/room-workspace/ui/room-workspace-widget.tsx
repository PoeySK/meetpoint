"use client";

import { useState } from "react";
import { CandidateManagementPanel } from "@/features/candidate-management";
import { CalculationResultPanel } from "@/features/calculation";
import { ParticipantResponsePanel } from "@/features/participant-response";
import { ParticipantConditionPanel } from "@/features/participant-condition";
import type { CalculationPayload } from "@/entities/calculation";
import type { DecisionPayload } from "@/entities/decision";
import type { RoomDetailsResponse } from "@/entities/room";

type WorkspaceStep = "candidates" | "condition" | "responses" | "result";

type RoomWorkspaceWidgetProps = {
  roomId: string;
  token: string;
  participantId: string;
  room: RoomDetailsResponse;
  onRoomReload: () => Promise<void>;
  onRoomRefresh: () => Promise<void>;
  latestScoreResult: CalculationPayload | null;
  decision: DecisionPayload | null;
};

const stepLabels: Record<WorkspaceStep, string> = {
  candidates: "후보 준비",
  responses: "내 의견",
  condition: "내 기준 · 선택",
  result: "결과 확인",
};

function getInitialStep(
  room: RoomDetailsResponse,
  isHost: boolean,
): WorkspaceStep {
  if (isHost && room.candidates.length === 0) {
    return "candidates";
  }
  if (room.room.status === "CALCULATED" || room.room.status === "CONFIRMED") {
    return "result";
  }
  return "responses";
}

function getSectionClassName(
  isActiveOnMobile: boolean,
  desktopPlacement: string,
) {
  return `${isActiveOnMobile ? "block" : "hidden"} lg:block ${desktopPlacement}`;
}

function getStatusLabel(status: RoomDetailsResponse["room"]["status"]) {
  const labels = {
    DRAFT: "준비 중",
    OPEN: "의견 받는 중",
    CALCULATING: "추천 결과 만드는 중",
    CALCULATED: "추천 결과 확인",
    CONFIRMED: "일정 확정",
    CLOSED: "종료",
  } as const;

  return labels[status];
}

export function RoomWorkspaceWidget({
  roomId,
  token,
  participantId,
  room,
  onRoomReload,
  onRoomRefresh,
  latestScoreResult,
  decision,
}: RoomWorkspaceWidgetProps) {
  const isHost = participantId === room.room.hostParticipantId;
  const [mobileStep, setMobileStep] = useState<WorkspaceStep>(() =>
    getInitialStep(room, isHost),
  );
  const [isCandidatePanelOpen, setIsCandidatePanelOpen] = useState(
    () => isHost && room.candidates.length === 0,
  );

  const candidateIds = new Set(room.candidates.map((candidate) => candidate.id));
  const responseCount = room.myResponses.filter((response) =>
    candidateIds.has(response.candidateId),
  ).length;
  const responseComplete =
    room.candidates.length > 0 && responseCount === room.candidates.length;
  const respondedParticipantCount = room.participants.filter(
    (participant) => participant.status === "RESPONDED",
  ).length;
  const progressLabel =
    room.candidates.length === 0
      ? "후보 준비 필요"
      : isHost
        ? `${respondedParticipantCount}/${room.participants.length}명 의견 작성 완료`
        : `${responseCount}/${room.candidates.length}개 후보 의견 작성 완료`;
  const completedSteps = [
    ...(isHost ? [room.candidates.length > 0] : []),
    responseComplete,
    room.room.status === "CALCULATED" || room.room.status === "CONFIRMED",
  ].filter(Boolean).length;
  const totalSteps = isHost ? 3 : 2;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  const mobileSteps: WorkspaceStep[] = [
    ...(isHost ? ["candidates" as const] : []),
    "responses",
    "condition",
    "result",
  ];
  const currentStepIndex = mobileSteps.indexOf(mobileStep);
  const canAdvance =
    mobileStep !== "result" &&
    (mobileStep !== "candidates" || room.candidates.length > 0);

  function advanceMobileStep() {
    if (!canAdvance) {
      return;
    }
    setMobileStep(mobileSteps[currentStepIndex + 1]);
  }

  function goBackMobileStep() {
    if (currentStepIndex > 0) {
      setMobileStep(mobileSteps[currentStepIndex - 1]);
    }
  }

  async function refreshAfterConditionSave() {
    await onRoomRefresh();
    setMobileStep("responses");
  }

  const responsePlacement = isHost
    ? "lg:col-span-8 lg:col-start-1 lg:row-start-2"
    : "lg:col-span-8 lg:col-start-1";
  const conditionPlacement = isHost
    ? "lg:col-span-4 lg:col-start-9 lg:row-start-2"
    : "lg:col-span-4 lg:col-start-9";

  return (
    <section className="space-y-4">
      <section className="mp-card mp-card-raised border-slate-200 bg-white/95 p-4 sm:p-5 lg:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-emerald-700">
                모임 진행
              </p>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {getStatusLabel(room.room.status)}
              </span>
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
              함께 정하는 시간과 장소
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {isHost && room.candidates.length === 0
                ? "후보를 준비하면 참여자들이 같은 기준으로 비교할 수 있습니다."
                : room.room.status === "CALCULATED" ||
                    room.room.status === "CONFIRMED"
                  ? "추천 결과와 확정된 일정을 확인할 수 있습니다."
                  : !responseComplete
                    ? "후보별 의견을 먼저 저장해 주세요. 내 기준 입력은 선택 사항입니다."
                    : !room.myCondition
                      ? "의견을 저장했습니다. 내 기준을 추가하면 예산·시간·특징 비교가 더 정확해집니다."
                      : "모든 준비가 끝나면 방장이 추천 결과를 만들 수 있습니다."}
            </p>
          </div>
          <div className="shrink-0 rounded-xl bg-slate-950 px-3.5 py-3 text-white sm:min-w-44 sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              진행 현황
            </p>
            <p className="mt-1 text-lg font-bold">{progressLabel}</p>
            <p className="mt-1 text-xs text-slate-400">후보 · 의견 · 내 기준</p>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
            <span>준비 진행률</span>
            <span>{progressPercent}%</span>
          </div>
          <div
            aria-label={`준비 진행률 ${progressPercent}%`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progressPercent}
            className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-emerald-600 transition-[width] duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <nav
          aria-label="방 진행 단계"
          className="mt-5 border-t border-slate-100 pt-4 lg:hidden"
        >
          <div className="flex gap-2 overflow-x-auto pb-1">
            {mobileSteps.map((step, index) => {
              const isActive = step === mobileStep;
              const isComplete =
                (step === "candidates" && room.candidates.length > 0) ||
                (step === "condition" && room.myCondition !== null) ||
                (step === "responses" && responseComplete) ||
                (step === "result" &&
                  (room.room.status === "CALCULATED" ||
                    room.room.status === "CONFIRMED"));

              return (
                <button
                  aria-current={isActive ? "step" : undefined}
                  className={`min-w-fit rounded-xl border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-200 ${
                    isActive
                      ? "border-slate-950 bg-slate-950 text-white"
                      : isComplete
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 bg-white text-slate-500"
                  }`}
                  key={step}
                  onClick={() => {
                    setMobileStep(step);
                    if (step === "candidates") {
                      setIsCandidatePanelOpen(true);
                    }
                  }}
                  type="button"
                >
                  <span className="block text-[11px] font-semibold uppercase tracking-wide opacity-70">
                    {index + 1}단계
                  </span>
                  <span className="mt-0.5 block text-sm font-semibold">
                    {stepLabels[step]}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-12">
        {isHost && (
          <div
            className={getSectionClassName(
              mobileStep === "candidates",
              "lg:col-span-12 lg:row-start-1",
            )}
          >
            <details
              className="group overflow-hidden rounded-[1.25rem] border border-emerald-100 bg-emerald-50/45"
              onToggle={(event) =>
                setIsCandidatePanelOpen(event.currentTarget.open)
              }
              open={isCandidatePanelOpen}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 sm:px-5 [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    방장 도구
                  </span>
                  <span className="mt-1 block text-base font-semibold text-slate-950">
                    후보 관리
                  </span>
                  <span className="mt-1 block text-sm text-slate-600">
                    {room.candidates.length} / 5개 후보 · 수정하거나 목록에서 뺄 수 있습니다.
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="text-xl text-slate-500 transition-transform group-open:rotate-180"
                >
                  ⌄
                </span>
              </summary>
              <div className="border-t border-emerald-100/80 p-2 sm:p-3">
                <CandidateManagementPanel
                  onRoomRefresh={onRoomRefresh}
                  participantId={participantId}
                  room={room}
                  roomId={roomId}
                  token={token}
                />
              </div>
            </details>
          </div>
        )}

        <div
          className={getSectionClassName(mobileStep === "responses", responsePlacement)}
        >
          <section className="mp-card p-4 sm:p-6">
            <ParticipantResponsePanel
              candidates={room.candidates}
              condition={room.myCondition}
              isReadOnly={
                room.room.status === "CONFIRMED" || room.room.status === "CLOSED"
              }
              onRoomRefresh={onRoomRefresh}
              participantId={participantId}
              responses={room.myResponses}
              roomId={roomId}
              token={token}
            />
          </section>
        </div>

        <div
          className={getSectionClassName(mobileStep === "condition", conditionPlacement)}
        >
          <ParticipantConditionPanel
            condition={room.myCondition}
            isReadOnly={
              room.room.status === "CONFIRMED" || room.room.status === "CLOSED"
            }
            onRoomRefresh={refreshAfterConditionSave}
            participantId={participantId}
            roomId={roomId}
            token={token}
          />
        </div>

        <div
          className={getSectionClassName(
            mobileStep === "result",
            "lg:col-span-12",
          )}
        >
          <CalculationResultPanel
            decision={decision}
            latestScoreResult={latestScoreResult}
            onRoomReload={onRoomReload}
            participantId={participantId}
            room={room}
            roomId={roomId}
            token={token}
          />
        </div>
      </div>

      <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg shadow-slate-900/10 backdrop-blur lg:hidden">
        <button
          className="mp-button mp-button-secondary min-w-20"
          disabled={currentStepIndex <= 0}
          onClick={goBackMobileStep}
          type="button"
        >
          이전
        </button>
        <p className="min-w-0 text-center text-xs font-medium text-slate-500">
          {stepLabels[mobileStep]}
        </p>
        <button
          className="mp-button mp-button-primary min-w-24"
          disabled={!canAdvance}
          onClick={advanceMobileStep}
          type="button"
        >
          {mobileStep === "candidates"
            ? "의견 입력"
            : mobileStep === "responses"
              ? "내 기준(선택)"
              : "추천 결과 보기"}
        </button>
      </div>
    </section>
  );
}
