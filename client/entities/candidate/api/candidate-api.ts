import { request } from "@/shared/api/http-client";
import type {
  CreateCandidateInput,
  CreatedCandidateResponse,
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
