"use client";

import { useCallback, useState } from "react";
import {
  kickParticipant,
  leaveRoom,
} from "@/entities/room";
import { RoomApiError } from "@/shared/api/http-client";

type UseParticipantLifecycleOptions = {
  roomId: string;
  token: string | null;
  onRoomRefresh: () => Promise<void>;
  onLeft: () => void;
};

function describeLifecycleError(error: unknown) {
  if (error instanceof RoomApiError) {
    if (error.code === "HOST_ONLY") {
      return "호스트만 다른 참가자를 강퇴할 수 있습니다.";
    }
    if (error.code === "ROOM_STATE_CONFLICT") {
      return "현재 방 상태에서는 나가기 또는 강퇴를 처리할 수 없습니다.";
    }
    if (error.code === "RESOURCE_NOT_FOUND") {
      return "참가자 또는 방을 찾을 수 없습니다. 방 상태를 다시 확인해 주세요.";
    }
    if (error.code === "TOKEN_EXPIRED" || error.code === "INVALID_TOKEN") {
      return "방 접근 토큰이 유효하지 않습니다. 방에 다시 입장해 주세요.";
    }
  }

  return "참가자 상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function useParticipantLifecycle({
  roomId,
  token,
  onRoomRefresh,
  onLeft,
}: UseParticipantLifecycleOptions) {
  const [isLeaving, setIsLeaving] = useState(false);
  const [removingParticipantId, setRemovingParticipantId] = useState<
    string | null
  >(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [lifecycleNotice, setLifecycleNotice] = useState<string | null>(null);

  const handleLeave = useCallback(async () => {
    if (!token || isLeaving || removingParticipantId) {
      return;
    }

    setIsLeaving(true);
    setLifecycleError(null);
    setLifecycleNotice(null);
    try {
      await leaveRoom(roomId, token);
      setLifecycleNotice("방에서 나갔습니다.");
      onLeft();
    } catch (error) {
      setLifecycleError(describeLifecycleError(error));
    } finally {
      setIsLeaving(false);
    }
  }, [isLeaving, onLeft, removingParticipantId, roomId, token]);

  const handleKick = useCallback(
    async (participantId: string, displayName: string) => {
      if (!token || isLeaving || removingParticipantId) {
        return;
      }

      setRemovingParticipantId(participantId);
      setLifecycleError(null);
      setLifecycleNotice(null);
      try {
        await kickParticipant(roomId, participantId, token);
        setLifecycleNotice(`${displayName}님을 방에서 제외했습니다.`);
        await onRoomRefresh();
      } catch (error) {
        setLifecycleError(describeLifecycleError(error));
      } finally {
        setRemovingParticipantId(null);
      }
    },
    [isLeaving, onRoomRefresh, removingParticipantId, roomId, token],
  );

  return {
    handleKick,
    handleLeave,
    isLeaving,
    lifecycleError,
    lifecycleNotice,
    removingParticipantId,
  };
}
