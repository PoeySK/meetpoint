"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { registerRoomRecovery } from "@/entities/room";
import { createRoomAccessRecovery } from "./room-access-recovery";
import type { RoomDetailsResponse } from "@/entities/room";
import { RoomApiError } from "@/shared/api/http-client";
import { getRoomTokenStorageKey, getRoomRecoveryStorageKey } from "@/shared/lib/room-session";
import {
  loadRoomSessionData,
  type RoomSessionData,
} from "./room-session-data";

const ROOM_REFRESH_INTERVAL_MS = 5_000;

export type RoomLoadError = {
  title: string;
  message: string;
  requiresRecovery?: boolean;
};

function describeRoomError(error: unknown): RoomLoadError {
  if (error instanceof RoomApiError) {
    if (error.code === "RECOVERY_UNAVAILABLE" || error.status === 401) {
      return {
        title: "기존 참여자의 접근을 복구할 수 없습니다.",
        requiresRecovery: true,
        message: "이 브라우저의 복구 정보가 없거나 만료·폐기되었습니다. 보관한 개인 복구 코드를 입력해 주세요. 모든 인증 정보를 잃었다면 기존 권한은 복구할 수 없습니다. 방 코드 입장은 새 MEMBER를 만들며 기존 조건·응답과 HOST 권한을 복구하지 않습니다.",
      };
    }
    if (error.status === 404) {
      return {
        title: "방을 찾을 수 없습니다.",
        message: "보관한 방 주소를 확인해 주세요. 일반 방 코드 입장은 기존 권한을 복구하지 않습니다.",
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
  const [recoveryRegistrationError, setRecoveryRegistrationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const sessionSnapshotRef = useRef<{
    room: RoomDetailsResponse;
    data: RoomSessionData;
  } | null>(null);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const recoveryController = useMemo(() => createRoomAccessRecovery(roomId), [roomId]);
  const pollingStoppedRef = useRef(false);

  const loadRoom = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setRefreshError(null);
    setRecoveryRegistrationError(null);
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

    try {
      const loaded = await recoveryController.load(token);
      const response = loaded.room;
      token = loaded.token;
      const data = await loadRoomSessionData(response, token, null, null);
      sessionSnapshotRef.current = { room: response, data };
      setRoom(response);
      setLatestScoreResult(data.latestScoreResult);
      setDecision(data.decision);
      setAccessToken(token);
      setParticipantId(response.currentParticipant.id);
      pollingStoppedRef.current = false;
      // Register legacy participants using their still-valid token; never rotate automatically.
      await registerRoomRecovery(roomId, token).then(({ recovery }) => {
        if (recovery.code) window.sessionStorage.setItem(getRoomRecoveryStorageKey(roomId), JSON.stringify(recovery));
      }).catch(() => {
        setRecoveryRegistrationError("개인 복구 수단의 등록 상태를 확인하지 못했습니다. 개인 복구 파일 보관 버튼에서 다시 등록하거나 보관한 파일을 확인해 주세요.");
      });
    } catch (requestError) {
      setError(describeRoomError(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [roomId, recoveryController]);

  const retryRoom = useCallback(() => {
    recoveryController.resetAutomaticAttempt();
    return loadRoom();
  }, [loadRoom, recoveryController]);

  const refreshRoom = useCallback((): Promise<void> => {
    if (!accessToken || pollingStoppedRef.current) {
      return Promise.resolve();
    }

    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const request = (async () => {
      try {
        const { room: response, token } = await recoveryController.load(accessToken);
        setAccessToken(token);
        const previousSnapshot = sessionSnapshotRef.current;
        const data = await loadRoomSessionData(
          response,
          token,
          previousSnapshot?.room ?? null,
          previousSnapshot?.data ?? null,
        );
        sessionSnapshotRef.current = { room: response, data };
        setRoom(response);
        setParticipantId(response.currentParticipant.id);
        setLatestScoreResult(data.latestScoreResult);
        setDecision(data.decision);
        setRefreshError(null);
      } catch (requestError) {
        if (requestError instanceof RoomApiError && requestError.status === 401) pollingStoppedRef.current = true;
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
  }, [accessToken, recoveryController]);

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
    recoveryRegistrationError,
    refreshRoom,
    retryRoom,
    room,
  };
}
