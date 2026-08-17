import { request } from "@/shared/api/http-client";
import type {
  CreateRoomInput,
  CreatedRoomResponse,
  JoinParticipantInput,
  JoinedParticipantResponse,
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
