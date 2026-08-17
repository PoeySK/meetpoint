import { request } from "@/shared/api/http-client";
import type {
  CreateRoomInput,
  CreatedRoomResponse,
  JoinParticipantInput,
  JoinedParticipantResponse,
  ParticipantLifecycleResponse,
  RoomDetailsResponse,
} from "@/entities/room/model/types";

export function createRoom(input: CreateRoomInput) {
  return request<CreatedRoomResponse>("/api/v1/rooms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export function joinRoom(roomCode: string, input: JoinParticipantInput) {
  return request<JoinedParticipantResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomCode)}/participants`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
}

export function getRoom(roomId: string, token: string) {
  return request<RoomDetailsResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
}

export function leaveRoom(roomId: string, token: string) {
  return request<ParticipantLifecycleResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/leave`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
}

export function kickParticipant(
  roomId: string,
  participantId: string,
  token: string,
) {
  return request<ParticipantLifecycleResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/participants/${encodeURIComponent(participantId)}/kick`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
}
