"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getRoom } from "@/entities/room";
import type { RoomDetailsResponse } from "@/entities/room";
import { RoomApiError } from "@/shared/api/http-client";
import { getRoomTokenStorageKey } from "@/shared/lib/room-session";
import {
  loadRoomSessionData,
  type RoomSessionData,
} from "./room-session-data";

const ROOM_REFRESH_INTERVAL_MS = 5_000;

export type RoomLoadError = {
  title: string;
  message: string;
};

function describeRoomError(error: unknown): RoomLoadError {
  if (error instanceof RoomApiError) {
    if (error.code === "TOKEN_EXPIRED") {
      return {
        title: "방 입장 정보가 만료되었습니다.",
        message: "방 코드로 다시 입장해 주세요.",
      };
    }

    if (error.code === "INVALID_TOKEN") {
      return {
        title: "방 입장 정보를 확인할 수 없습니다.",
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
    title: "서비스에 연결할 수 없습니다.",
    message: "인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
  };
}

export function useRoomSession(roomId: string) {
  const [room, setRoom] = useState<RoomDetailsResponse | null>(null);
  const [latestScoreResult, setLatestScoreResult] = useState<
    RoomSessionData["latestScoreResult"]
  >(null);
  const [decision, setDecision] = useState<RoomSessionData["decision"]>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [error, setError] = useState<RoomLoadError | null>(null);
  const [refreshError, setRefreshError] = useState<RoomLoadError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const sessionSnapshotRef = useRef<{
    room: RoomDetailsResponse;
    data: RoomSessionData;
  } | null>(null);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  const loadRoom = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setRefreshError(null);
    setRoom(null);
    setLatestScoreResult(null);
    setDecision(null);
    setAccessToken(null);
    setParticipantId(null);
    sessionSnapshotRef.current = null;

    let token: string | null = null;
    try {
      token = window.sessionStorage.getItem(getRoomTokenStorageKey(roomId));
    } catch {
      setError({
        title: "브라우저에 입장 정보를 저장할 수 없습니다.",
        message: "브라우저 설정을 확인한 뒤 다시 시도해 주세요.",
      });
      setIsLoading(false);
      return;
    }

    if (!token) {
      setError({
        title: "이 방에 다시 입장해야 합니다.",
        message: "방 코드와 이름을 입력해 다시 입장해 주세요.",
      });
      setIsLoading(false);
      return;
    }

    try {
      const response = await getRoom(roomId, token);
      const data = await loadRoomSessionData(response, token, null, null);
      sessionSnapshotRef.current = { room: response, data };
      setRoom(response);
      setLatestScoreResult(data.latestScoreResult);
      setDecision(data.decision);
      setAccessToken(token);
      setParticipantId(response.currentParticipant.id);
    } catch (requestError) {
      setError(describeRoomError(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  const refreshRoom = useCallback((): Promise<void> => {
    if (!accessToken) {
      return Promise.resolve();
    }

    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const request = (async () => {
      try {
        const response = await getRoom(roomId, accessToken);
        const previousSnapshot = sessionSnapshotRef.current;
        const data = await loadRoomSessionData(
          response,
          accessToken,
          previousSnapshot?.room ?? null,
          previousSnapshot?.data ?? null,
        );
        sessionSnapshotRef.current = { room: response, data };
        setRoom(response);
        setLatestScoreResult(data.latestScoreResult);
        setDecision(data.decision);
        setRefreshError(null);
      } catch (requestError) {
        setRefreshError(describeRoomError(requestError));
      }
    })();

    refreshPromiseRef.current = request;
    void request.finally(() => {
      if (refreshPromiseRef.current === request) {
        refreshPromiseRef.current = null;
      }
    });

    return request;
  }, [accessToken, roomId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadRoom();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadRoom]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void refreshRoom();
      }
    }

    const intervalId = window.setInterval(
      refreshWhenVisible,
      ROOM_REFRESH_INTERVAL_MS,
    );
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [accessToken, refreshRoom]);

  return {
    accessToken,
    decision,
    error,
    isLoading,
    loadRoom,
    latestScoreResult,
    participantId,
    refreshError,
    refreshRoom,
    room,
  };
}
