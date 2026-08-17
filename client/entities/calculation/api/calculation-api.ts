import { request } from "@/shared/api/http-client";
import type {
  CalculationResponse,
  LatestScoreResultResponse,
  StartCalculationResponse,
} from "@/entities/calculation/model/types";

export function startCalculation(
  roomId: string,
  token: string,
  clientRequestId: string,
) {
  return request<StartCalculationResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/calculations`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ clientRequestId }),
    },
  );
}

export function getCalculation(
  roomId: string,
  calculationId: string,
  token: string,
) {
  return request<CalculationResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/calculations/${encodeURIComponent(calculationId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
}

export function getLatestScoreResult(roomId: string, token: string) {
  return request<LatestScoreResultResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/score-results/latest`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
}
