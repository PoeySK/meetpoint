"use client";

import { useCallback, useEffect, useState } from "react";
import { getRoom } from "@/entities/room/api/room-api";
import type { RoomDetailsResponse } from "@/entities/room/model/types";
import { RoomApiError } from "@/shared/api/http-client";
import {
  getRoomParticipantStorageKey,
  getRoomTokenStorageKey,
} from "@/shared/lib/room-session";

export type RoomLoadError = {
  title: string;
  message: string;
};

function describeRoomError(error: unknown): RoomLoadError {
  if (error instanceof RoomApiError) {
    if (error.code === "TOKEN_EXPIRED") {
      return {
        title: "접근 토큰이 만료되었습니다.",
        message: "방 코드로 다시 입장해 주세요.",
      };
    }

    if (error.code === "INVALID_TOKEN") {
      return {
        title: "접근 토큰을 확인할 수 없습니다.",
        message: "방 코드와 이름을 입력해 다시 입장해 주세요.",
      };
    }

    if (error.status === 404) {
      return {
        title: "방을 찾을 수 없습니다.",
        message: "주소를 확인하거나 방 코드로 다시 입장해 주세요.",
      };
    }

    return {
      title: "방 정보를 불러오지 못했습니다.",
      message: "잠시 후 다시 시도해 주세요.",
    };
  }

  return {
    title: "서버에 연결할 수 없습니다.",
    message: "네트워크 연결과 API 서버 상태를 확인한 뒤 다시 시도해 주세요.",
  };
}

export function useRoomSession(roomId: string) {
  const [room, setRoom] = useState<RoomDetailsResponse | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [error, setError] = useState<RoomLoadError | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadRoom = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setRoom(null);
    setAccessToken(null);
    setParticipantId(null);

    let token: string | null = null;
    let storedParticipantId: string | null = null;
    try {
      token = window.sessionStorage.getItem(getRoomTokenStorageKey(roomId));
      storedParticipantId = window.sessionStorage.getItem(
        getRoomParticipantStorageKey(roomId),
      );
    } catch {
      setError({
        title: "브라우저 저장소에 접근할 수 없습니다.",
        message: "세션 저장소를 사용할 수 있는 브라우저에서 다시 시도해 주세요.",
      });
      setIsLoading(false);
      return;
    }

    if (!token) {
      setError({
        title: "이 방에 접근할 토큰이 없습니다.",
        message: "방 코드와 이름을 입력해 다시 입장해 주세요.",
      });
      setIsLoading(false);
      return;
    }

    try {
      const response = await getRoom(roomId, token);
      setRoom(response);
      setAccessToken(token);
      setParticipantId(storedParticipantId);
    } catch (requestError) {
      setError(describeRoomError(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  const refreshRoom = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    try {
      const response = await getRoom(roomId, accessToken);
      setRoom(response);
    } catch (requestError) {
      setError(describeRoomError(requestError));
    }
  }, [accessToken, roomId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadRoom();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadRoom]);

  return {
    accessToken,
    error,
    isLoading,
    loadRoom,
    participantId,
    refreshRoom,
    room,
  };
}
