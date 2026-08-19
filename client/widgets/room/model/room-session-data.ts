import { getLatestScoreResult } from "@/entities/calculation";
import type { CalculationPayload } from "@/entities/calculation";
import { getDecision } from "@/entities/decision";
import type { DecisionPayload } from "@/entities/decision";
import type { RoomDetailsResponse } from "@/entities/room";
import { RoomApiError } from "@/shared/api/http-client";

export type RoomSessionData = {
  latestScoreResult: CalculationPayload | null;
  decision: DecisionPayload | null;
};

function isExpectedNotFound(error: unknown, code: string) {
  return error instanceof RoomApiError && error.code === code;
}

export async function loadRoomSessionData(
  room: RoomDetailsResponse,
  token: string,
  previousRoom: RoomDetailsResponse | null,
  previousData: RoomSessionData | null,
): Promise<RoomSessionData> {
  let latestScoreResult: CalculationPayload | null = null;

  if (room.room.latestScoreResultId) {
    try {
      latestScoreResult = (
        await getLatestScoreResult(room.room.id, token)
      ).scoreResult;
    } catch (error) {
      if (!isExpectedNotFound(error, "SCORE_RESULT_NOT_FOUND")) {
        throw error;
      }
    }
  }

  let decision: DecisionPayload | null = null;
  if (room.room.currentDecisionId) {
    const decisionNeedsRefresh =
      !previousRoom ||
      !previousData ||
      previousData.decision === null ||
      previousRoom.room.currentDecisionId !== room.room.currentDecisionId ||
      previousRoom.room.status !== room.room.status;

    if (!decisionNeedsRefresh) {
      decision = previousData.decision;
    } else {
      try {
        decision = (await getDecision(room.room.id, token)).decision;
      } catch (error) {
        if (!isExpectedNotFound(error, "DECISION_NOT_FOUND")) {
          throw error;
        }
      }
    }
  }

  return { latestScoreResult, decision };
}
