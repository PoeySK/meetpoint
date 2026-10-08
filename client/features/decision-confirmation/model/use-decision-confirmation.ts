"use client";

import { useCallback, useState } from "react";
import { createDecision, reopenDecision } from "@/entities/decision";
import type { DecisionPayload } from "@/entities/decision";
import type { CalculationPayload } from "@/entities/calculation";
import type { RoomDetailsResponse } from "@/entities/room";
import { RoomApiError } from "@/shared/api/http-client";
import { getRoomAccessErrorMessage } from "@/shared/lib/room-access-error";

type UseDecisionConfirmationOptions = {
  roomId: string;
  token: string;
  room: RoomDetailsResponse;
  calculation: CalculationPayload | null;
  decision: DecisionPayload | null;
  selectedCandidateId: string | null;
  onRoomReload: () => Promise<void>;
};

function describeDecisionError(error: unknown) {
  if (error instanceof RoomApiError && error.status === 429) return error.message;
  if (error instanceof RoomApiError) {
    if (error.code === "HOST_ONLY") {
      return "방장만 후보를 선택해 일정을 확정하거나 확정 내용을 다시 검토할 수 있습니다.";
    }
    if (error.code === "STALE_RESULT") {
      return "후보·참여자·선택 조건·의견이 바뀌어 최신 추천 결과가 아닙니다. 현재 내용으로 다시 만들어 주세요.";
    }
    if (error.code === "BUSINESS_RULE_VIOLATION") {
      return "모든 후보에 응답했는지, 선택한 후보의 확인할 점을 확인해 주세요.";
    }
    if (error.code === "ROOM_STATE_CONFLICT") {
      return "현재 방 상태에서는 일정을 바꿀 수 없습니다.";
    }
    const accessMessage = getRoomAccessErrorMessage(error);
    if (accessMessage) return accessMessage;
  }

  return "일정 확정 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function useDecisionConfirmation({
  roomId,
  token,
  room,
  calculation,
  decision: loadedDecision,
  selectedCandidateId,
  onRoomReload,
}: UseDecisionConfirmationOptions) {
  const decision = loadedDecision;
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);
  const [acknowledgeIssues, setAcknowledgeIssues] = useState(false);
  const [decisionNote, setDecisionNote] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [isReopening, setIsReopening] = useState(false);

  const resetDecisionDraft = useCallback(() => {
    setAcknowledgeIssues(false);
    setDecisionNote("");
    setDecisionError(null);
    setDecisionNotice(null);
  }, []);

  const selectedCandidate =
    calculation?.status === "COMPLETED"
      ? calculation.candidates.find(
          (candidate) => candidate.candidateId === selectedCandidateId,
        )
      : undefined;
  const selectedCandidateHasIssues = Boolean(
    selectedCandidate &&
      calculation &&
      (selectedCandidate.matchLevel !== "FULL" ||
        calculation.recommendationWarnings.includes("LOW_SCORE")),
  );
  const coverageIsComplete = Boolean(
    calculation &&
      calculation.coverage.submittedResponses ===
        calculation.coverage.expectedResponses,
  );

  async function handleConfirm() {
    if (!calculation || calculation.status !== "COMPLETED") {
      return;
    }

    if (!selectedCandidate) {
      setDecisionError("일정을 확정할 후보를 먼저 선택해 주세요.");
      return;
    }

    if (room.room.status !== "CALCULATED") {
      setDecisionError(
        "현재 내용으로 만든 추천 결과가 아닙니다. 최신 결과를 다시 만들어 주세요.",
      );
      return;
    }

    if (!coverageIsComplete) {
      setDecisionError(
        "모든 참여자가 모든 후보에 응답해야 일정을 확정할 수 있습니다.",
      );
      return;
    }

    const normalizedNote = decisionNote.trim();
    if (
      selectedCandidateHasIssues &&
      (!acknowledgeIssues ||
        !normalizedNote ||
        normalizedNote.length > 300)
    ) {
      setDecisionError(
        "확인할 점이 있는 후보는 내용을 확인했다는 표시와 1~300자의 메모가 필요합니다.",
      );
      return;
    }

    setIsConfirming(true);
    setDecisionError(null);
    setDecisionNotice(null);
    try {
      await createDecision(roomId, token, {
        candidateId: selectedCandidate.candidateId,
        scoreResultId: calculation.id,
        acknowledgeIssues: selectedCandidateHasIssues
          ? acknowledgeIssues
          : false,
        decisionNote: normalizedNote || null,
      });
      setDecisionNotice("일정을 확정했습니다.");
      await onRoomReload();
    } catch (requestError) {
      setDecisionError(describeDecisionError(requestError));
    } finally {
      setIsConfirming(false);
    }
  }

  async function handleReopen() {
    const normalizedReason = reopenReason.trim();
    if (!normalizedReason || normalizedReason.length > 300) {
      setDecisionError("다시 검토할 이유를 1~300자로 입력해 주세요.");
      return;
    }

    setIsReopening(true);
    setDecisionError(null);
    setDecisionNotice(null);
    try {
      await reopenDecision(roomId, token, {
        reason: normalizedReason,
      });
      setReopenReason("");
      setDecisionNotice(
        "다시 검토를 시작했습니다. 후보나 의견을 바꾼 뒤 추천 결과를 다시 만들어 주세요.",
      );
      await onRoomReload();
    } catch (requestError) {
      setDecisionError(describeDecisionError(requestError));
    } finally {
      setIsReopening(false);
    }
  }

  return {
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
  };
}
