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

export type RecoveredRoomAccess = {
  participant: RoomDetailsResponse["currentParticipant"];
  access: { participantToken: string };
  recoveryExpiresAt: string;
};

const pendingRecoveries = new Map<string, Promise<RecoveredRoomAccess>>();

export function recoverRoomAccess(roomId: string, recoveryCode?: string) {
  const pending = pendingRecoveries.get(roomId);
  if (pending) return pending;
  const recovery = request<RecoveredRoomAccess>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/recovery`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(recoveryCode ? { recoveryCode } : {}) },
  );
  pendingRecoveries.set(roomId, recovery);
  void recovery.finally(() => {
    if (pendingRecoveries.get(roomId) === recovery) pendingRecoveries.delete(roomId);
  }).catch(() => {});
  return recovery;
}

export function registerRoomRecovery(roomId: string, token: string, replace = false) {
  return request<{ recovery: { code: string | null; expiresAt: string } }>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/recovery/register`,
    { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ replace }) },
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
