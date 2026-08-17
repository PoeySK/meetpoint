import { request } from "@/shared/api/http-client";
import type {
  CreateDecisionInput,
  CreateDecisionResponse,
  DecisionResponse,
  ReopenDecisionInput,
  ReopenDecisionResponse,
} from "@/entities/decision/model/types";

export function createDecision(
  roomId: string,
  token: string,
  input: CreateDecisionInput,
) {
  return request<CreateDecisionResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/decision`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
}

export function reopenDecision(
  roomId: string,
  token: string,
  input: ReopenDecisionInput,
) {
  return request<ReopenDecisionResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/decision/reopen`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
}

export function getDecision(roomId: string, token: string) {
  return request<DecisionResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/decision`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
}
