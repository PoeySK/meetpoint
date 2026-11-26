"use client";

import { useState, type ReactNode } from "react";
import { CandidateManagementPanel } from "@/features/candidate-management";
import { CalculationResultPanel } from "@/features/calculation";
import { ParticipantResponsePanel } from "@/features/participant-response";
import { ParticipantConditionPanel } from "@/features/participant-condition";
import type { CalculationPayload } from "@/entities/calculation";
import type { DecisionPayload } from "@/entities/decision";
import type { RoomDetailsResponse, RoomStatus } from "@/entities/room";

type WorkspaceStep = "candidates" | "condition" | "responses" | "result";
type WorkspaceTarget = WorkspaceStep | "participants";

type NextAction = {
  title: string;
  message: string;
  link?: { label: string; target: WorkspaceTarget };
};

type RoomWorkspaceWidgetProps = {
  roomId: string;
  token: string;
  participantId: string;
  room: RoomDetailsResponse;
  onRoomReload: () => Promise<void>;
  onRoomRefresh: () => Promise<void>;
  latestScoreResult: CalculationPayload | null;
  decision: DecisionPayload | null;
  roomTools: ReactNode;
};

const stepLabels: Record<WorkspaceStep, string> = {
  candidates: "후보 준비",
  responses: "내 의견",
  condition: "선택 조건",
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

function getSectionClassName(isActiveOnMobile: boolean) {
  return `${isActiveOnMobile ? "block" : "hidden"} min-w-0 scroll-mt-4 lg:block`;
}

function getNextAction({ status, isHost, candidateCount, responseCount, participantCount, respondedCount }: {
  status: RoomStatus;
  isHost: boolean;
  candidateCount: number;
  responseCount: number;
  participantCount: number;
  respondedCount: number;
}): NextAction | null {
  if (status === "CONFIRMED" || status === "CLOSED") return null;

  if (status === "CALCULATING") {
    return {
      title: "추천 결과를 준비하고 있어요",
      message: "결과가 준비되면 이 방에서 확인할 수 있어요.",
      link: { label: "진행 상황 보기", target: "result" },
    };
  }

  if (isHost && status === "CALCULATED") {
    return {
      title: "추천 결과를 확인해 주세요",
      message: "후보별 의견과 확인할 점을 살펴보고 일정을 정할 수 있어요.",
      link: { label: "결과로 이동", target: "result" },
    };
  }

  if (isHost && candidateCount < 2) {
    return {
      title: candidateCount === 0 ? "첫 후보를 등록해 주세요" : "후보를 하나 더 등록해 주세요",
      message: "시간과 장소를 정해 후보를 두 개 이상 준비해 주세요.",
      link: { label: "후보 등록하기", target: "candidates" },
    };
  }

  if (candidateCount === 0) {
    return {
      title: "방장이 후보를 준비하고 있어요",
      message: "후보가 등록되면 여기에서 의견을 남길 수 있어요.",
    };
  }

  if (responseCount < candidateCount) {
    return {
      title: "후보에 의견을 남겨 주세요",
      message: `내 의견 ${responseCount}/${candidateCount}개 완료 · 참석 가능 여부와 이동 부담을 알려 주세요.`,
      link: { label: "내 의견 남기기", target: "responses" },
    };
  }

  if (!isHost) {
    return status === "CALCULATED"
      ? {
          title: "추천 결과가 나왔어요",
          message: "후보별 추천 근거를 볼 수 있어요. 최종 일정은 방장이 정해요.",
          link: { label: "결과로 이동", target: "result" },
        }
      : {
          title: "의견을 모두 남겼어요",
          message: "방장이 추천 결과를 만들면 이 방에서 확인할 수 있어요.",
        };
  }

  if (participantCount < 3 || respondedCount < participantCount) {
    return {
      title: participantCount < 3 ? "참여자를 더 초대해 주세요" : "참여자 의견을 확인해 주세요",
      message: participantCount < 3
        ? "추천 결과를 만들려면 방장을 포함해 3명이 필요해요. 위의 초대 링크를 보내 주세요."
        : `${respondedCount}/${participantCount}명이 의견을 모두 남겼어요.`,
      link: { label: "참여자 보기", target: "participants" },
    };
  }

  return {
    title: "추천 결과를 만들 수 있어요",
    message: `${respondedCount}명이 모든 후보에 의견을 남겼어요.`,
    link: { label: "추천 단계로 이동", target: "result" },
  };
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
  roomTools,
}: RoomWorkspaceWidgetProps) {
  const isHost = participantId === room.room.hostParticipantId;
  const isConfirmed = room.room.status === "CONFIRMED";
  const [workingStep, setWorkingStep] = useState<WorkspaceStep>(() =>
    getInitialStep(room, isHost),
  );
  const [confirmedStep, setConfirmedStep] = useState<WorkspaceStep>("result");
  const mobileStep = isConfirmed ? confirmedStep : workingStep;
  const [isCandidatePanelOpen, setIsCandidatePanelOpen] = useState(
    () => isHost && room.candidates.length === 0,
  );
  const [isConditionPanelOpen, setIsConditionPanelOpen] = useState(false);

  const candidateIds = new Set(room.candidates.map((candidate) => candidate.id));
  const responseCount = room.myResponses.filter((response) =>
    candidateIds.has(response.candidateId) && response.status === "SUBMITTED",
  ).length;
  const respondedParticipantCount = room.participants.filter(
    (participant) => participant.status === "RESPONDED",
  ).length;
  const nextAction = getNextAction({
    status: room.room.status,
    isHost,
    candidateCount: room.candidates.length,
    responseCount,
    participantCount: room.participants.length,
    respondedCount: respondedParticipantCount,
  });
  const actionLink = nextAction?.link;
  const isResponseStepActive = actionLink?.target === "responses" && mobileStep === "responses";

  const mobileSteps: WorkspaceStep[] = [
    ...(isHost ? ["candidates" as const] : []),
    "responses",
    "condition",
    "result",
  ];
  function selectStep(step: WorkspaceStep) {
    if (isConfirmed) setConfirmedStep(step);
    else setWorkingStep(step);
    if (step === "candidates") setIsCandidatePanelOpen(true);
    if (step === "condition") setIsConditionPanelOpen(true);
  }

  function goToTarget(target: WorkspaceTarget) {
    if (target !== "participants") selectStep(target);
    window.requestAnimationFrame(() => {
      const panel = document.getElementById(`room-${target}`);
      panel?.focus({ preventScroll: true });
      panel?.scrollIntoView({ block: "start" });
    });
  }

  async function refreshAfterConditionSave() {
    await onRoomRefresh();
    setWorkingStep("responses");
  }

  return (
    <section className="space-y-3 sm:space-y-5">
      {nextAction && (
        <section
          aria-labelledby="room-next-action-heading"
          className={`flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-[var(--mp-line)] bg-[var(--mp-surface)] px-4 py-3 sm:px-5 ${isResponseStepActive ? "hidden lg:flex" : "flex"}`}
        >
          <div>
            <h2 className="font-bold tracking-tight" id="room-next-action-heading">
              {nextAction.title}
            </h2>
            <p className="mt-0.5 text-sm leading-5 text-[var(--mp-muted)]">
              {nextAction.message}
            </p>
          </div>
          {actionLink && (
            <button
              className="mp-button mp-button-secondary min-h-11 text-[var(--mp-purple)]"
              onClick={() => goToTarget(actionLink.target)}
              type="button"
            >
              {actionLink.label}
            </button>
          )}
        </section>
      )}

      <nav aria-label="방 진행 단계" className="lg:hidden">
        <div className="grid auto-cols-fr grid-flow-col gap-1 border-b border-[var(--mp-line)] pb-2">
          {mobileSteps.map((step) => {
            const isActive = step === mobileStep;

            return (
              <button
                aria-current={isActive ? "step" : undefined}
                className={`mp-button min-h-11 min-w-0 rounded-lg border px-0 py-2 text-xs whitespace-nowrap ${
                  isActive
                    ? "border-[var(--mp-line)] bg-[var(--mp-lilac)] text-[var(--mp-purple-hover)]"
                    : "border-transparent text-[var(--mp-muted)] hover:bg-[var(--mp-lilac)]"
                }`}
                key={step}
                onClick={() => selectStep(step)}
                type="button"
              >
                {stepLabels[step]}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="grid gap-4 sm:gap-5">
        <div
          className={getSectionClassName(mobileStep === "responses")}
          id="room-responses"
          tabIndex={-1}
        >
          <ParticipantResponsePanel
            candidates={room.candidates}
            condition={room.myCondition}
            isReadOnly={
              room.room.status === "CALCULATING" ||
              room.room.status === "CONFIRMED" || room.room.status === "CLOSED"
            }
            onRoomRefresh={onRoomRefresh}
            participantId={participantId}
            responses={room.myResponses}
            roomId={roomId}
            token={token}
          />
        </div>

        {isHost && (
          <div
            className={getSectionClassName(mobileStep === "candidates")}
            id="room-candidates"
            tabIndex={-1}
          >
            <details
              className="mp-card group"
              onToggle={(event) =>
                setIsCandidatePanelOpen(event.currentTarget.open)
              }
              open={isCandidatePanelOpen}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-4 py-3.5 focus-visible:outline-2 focus-visible:outline-slate-600 group-open:hidden sm:px-5 lg:group-open:flex [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block text-sm font-semibold text-slate-950">
                    후보 관리
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="text-xl text-slate-500 transition-transform group-open:rotate-180"
                >
                  ⌄
                </span>
              </summary>
              <div className="lg:border-t lg:border-[var(--mp-line)]">
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
          className={getSectionClassName(mobileStep === "result")}
          id="room-result"
          tabIndex={-1}
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

        <div
          className={getSectionClassName(mobileStep === "condition")}
        >
          <details className="mp-card group" onToggle={(event) => setIsConditionPanelOpen(event.currentTarget.open)} open={isConditionPanelOpen}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-slate-600 group-open:hidden lg:group-open:flex [&::-webkit-details-marker]:hidden">
              선택 조건 {room.myCondition ? "보기" : "추가"}
              <span aria-hidden="true" className="mr-1 size-2 shrink-0 rotate-45 border-r border-b border-current transition-transform group-open:-rotate-135 motion-reduce:transition-none" />
            </summary>
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
          </details>
        </div>
      </div>

      {roomTools}
    </section>
  );
}
