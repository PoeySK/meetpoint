import { request } from "@/shared/api/http-client";
import type {
  CandidateMutationResponse,
  CreateCandidateInput,
  CreatedCandidateResponse,
  UpdateCandidateInput,
} from "@/entities/candidate/model/types";

export function createCandidate(
  roomId: string,
  token: string,
  input: CreateCandidateInput,
) {
  return request<CreatedCandidateResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/candidates`,
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

export function updateCandidate(
  roomId: string,
  candidateId: string,
  token: string,
  version: number,
  input: UpdateCandidateInput,
) {
  return request<CandidateMutationResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/candidates/${encodeURIComponent(candidateId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "If-Match-Version": String(version),
      },
      body: JSON.stringify(input),
    },
  );
}

export function archiveCandidate(
  roomId: string,
  candidateId: string,
  token: string,
  version: number,
) {
  return request<CandidateMutationResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/candidates/${encodeURIComponent(candidateId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "If-Match-Version": String(version),
      },
    },
  );
}
