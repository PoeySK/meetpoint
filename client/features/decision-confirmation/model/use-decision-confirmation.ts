"use client";

import { useCallback, useState } from "react";
import { createDecision, reopenDecision } from "@/entities/decision";
import type { DecisionPayload } from "@/entities/decision";
import type { CalculationPayload } from "@/entities/calculation";
import type { RoomDetailsResponse } from "@/entities/room";
import { RoomApiError } from "@/shared/api/http-client";

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
  if (error instanceof RoomApiError) {
    if (error.code === "HOST_ONLY") {
      return "호스트만 후보를 확정하거나 재검토할 수 있습니다.";
    }
    if (error.code === "STALE_RESULT") {
      return "최신 계산 결과가 아닙니다. 현재 입력으로 다시 계산해 주세요.";
    }
    if (error.code === "BUSINESS_RULE_VIOLATION") {
      return "응답 완료 여부 또는 이슈 확인 조건을 다시 확인해 주세요.";
    }
    if (error.code === "ROOM_STATE_CONFLICT") {
      return "현재 방 상태에서는 결정을 변경할 수 없습니다.";
    }
    if (error.code === "TOKEN_EXPIRED" || error.code === "INVALID_TOKEN") {
      return "방 접근 토큰이 유효하지 않습니다. 방에 다시 입장해 주세요.";
    }
  }

  return "Decision 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
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
      setDecisionError("확정할 후보를 먼저 선택해 주세요.");
      return;
    }

    if (room.room.status !== "CALCULATED") {
      setDecisionError(
        "현재 방 상태에서는 확정할 수 없습니다. 새로 계산해 주세요.",
      );
      return;
    }

    if (!coverageIsComplete) {
      setDecisionError(
        "모든 참여자가 모든 후보에 응답을 저장해야 확정할 수 있습니다.",
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
        "이슈가 있는 후보는 확인 checkbox와 1~300자의 결정 메모가 필요합니다.",
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
      setDecisionNotice("후보가 확정되었습니다.");
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
      setDecisionError("재검토 사유를 1~300자로 입력해 주세요.");
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
        "재검토를 시작했습니다. 후보 또는 응답을 변경한 뒤 다시 계산해 주세요.",
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
