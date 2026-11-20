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

function getSectionClassName(
  isActiveOnMobile: boolean,
  desktopPlacement: string,
) {
  return `${isActiveOnMobile ? "block" : "hidden"} lg:block ${desktopPlacement}`;
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
  const [mobileStep, setMobileStep] = useState<WorkspaceStep>(() =>
    getInitialStep(room, isHost),
  );
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

  const mobileSteps: WorkspaceStep[] = [
    ...(isHost ? ["candidates" as const] : []),
    "responses",
    "condition",
    "result",
  ];
  function selectStep(step: WorkspaceStep) {
    setMobileStep(step);
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
      {nextAction && (
        <section
          aria-labelledby="room-next-action-heading"
          className="border-b border-slate-200 px-1 pb-4 pt-1 sm:flex sm:items-center sm:justify-between sm:gap-5"
        >
          <div>
            <h2 className="text-lg font-bold tracking-tight" id="room-next-action-heading">
              {nextAction.title}
            </h2>
            <p className="mt-1 text-sm leading-5 text-slate-700">{nextAction.message}</p>
          </div>
          {actionLink && (
            <button
              className="mp-button mp-button-primary mt-3 w-full sm:mt-0 sm:w-auto sm:shrink-0"
              onClick={() => goToTarget(actionLink.target)}
              type="button"
            >
              {actionLink.label}
            </button>
          )}
        </section>
      )}

      {roomTools}

      <nav aria-label="방 진행 단계" className="lg:hidden">
        <div className="flex flex-wrap gap-1.5">
          {mobileSteps.map((step) => {
            const isActive = step === mobileStep;

            return (
              <button
                aria-current={isActive ? "step" : undefined}
                className={`mp-button rounded-lg border px-2.5 py-2 text-xs ${
                  isActive
                    ? "border-slate-800 bg-slate-100 text-slate-950"
                    : "border-transparent text-slate-600 hover:bg-slate-100"
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

      <div className="grid items-start gap-5 lg:grid-cols-12">
        {isHost && (
          <div
            className={getSectionClassName(
              mobileStep === "candidates",
              "scroll-mt-4 lg:col-span-12 lg:row-start-1",
            )}
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
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-4 py-3.5 focus-visible:outline-2 focus-visible:outline-slate-600 sm:px-5 [&::-webkit-details-marker]:hidden">
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
              <div className="border-t border-slate-200">
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
          className={getSectionClassName(mobileStep === "responses", `scroll-mt-4 ${responsePlacement}`)}
          id="room-responses"
          tabIndex={-1}
        >
          <section className="mp-card p-4 sm:p-6">
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
          </section>
        </div>

        <div
          className={getSectionClassName(mobileStep === "condition", conditionPlacement)}
        >
          <details className="mp-card" onToggle={(event) => setIsConditionPanelOpen(event.currentTarget.open)} open={isConditionPanelOpen}>
            <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-slate-600">
              선택 조건 {room.myCondition ? "보기" : "추가"}
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

        <div
          className={getSectionClassName(
            mobileStep === "result",
            "scroll-mt-4 lg:col-span-12",
          )}
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
      </div>

    </section>
  );
}
