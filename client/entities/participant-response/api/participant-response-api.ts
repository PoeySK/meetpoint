import { request } from "@/shared/api/http-client";
import type {
  UpsertParticipantResponseInput,
  UpsertedParticipantResponse,
} from "@/entities/participant-response/model/types";

export function upsertParticipantResponse(
  roomId: string,
  participantId: string,
  candidateId: string,
  token: string,
  input: UpsertParticipantResponseInput,
) {
  return request<UpsertedParticipantResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/participants/${encodeURIComponent(participantId)}/responses/${encodeURIComponent(candidateId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
}
