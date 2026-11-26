'use client';

import type { RoomDetailsResponse } from '@/entities/room';
import { registerRoomRecovery } from '@/entities/room';
import { RoomApiError } from '@/shared/api/http-client';
import { getRoomAccessErrorMessage } from '@/shared/lib/room-access-error';
import {
  getRoomRecoveryStorageKey,
  getRoomTokenStorageKey,
} from '@/shared/lib/room-session';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoomAccessRecovery } from './room-access-recovery';
import { loadRoomSessionData, type RoomSessionData } from './room-session-data';

const ROOM_REFRESH_INTERVAL_MS = 5_000;

export type RoomLoadError = {
  title: string;
  message: string;
  requiresRecovery?: boolean;
};

function describeRoomError(error: unknown): RoomLoadError {
  if (error instanceof RoomApiError && error.status === 429) {
    return { title: '잠시 기다린 뒤 다시 시도해 주세요.', message: error.message };
  }
  if (error instanceof RoomApiError) {
    if (error.code === 'RECOVERY_UNAVAILABLE') {
      return {
        title: '이 브라우저에서 방을 바로 열 수 없어요',
        requiresRecovery: true,
        message:
          '다시 불러오거나, 보관해 둔 개인 복구 코드를 아래에 입력해 주세요. 초대받을 때 받은 방 코드로 들어가면 새 참여자로 입장해요.',
      };
    }
    const accessMessage = getRoomAccessErrorMessage(error);
    if (accessMessage) {
      return { title: '방을 다시 열어 주세요', requiresRecovery: true, message: accessMessage };
    }
    if (error.status === 404) {
      return {
        title: '방을 찾을 수 없습니다.',
        message: '보관한 방 주소가 맞는지 확인해 주세요.',
      };
    }

    return {
      title: '방 정보를 불러오지 못했습니다.',
      message: '잠시 후 다시 시도해 주세요.',
    };
  }

  return {
    title: '서비스에 연결할 수 없습니다.',
    message: '인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
  };
}

export function useRoomSession(roomId: string) {
  const [room, setRoom] = useState<RoomDetailsResponse | null>(null);
  const [latestScoreResult, setLatestScoreResult] =
    useState<RoomSessionData['latestScoreResult']>(null);
  const [decision, setDecision] = useState<RoomSessionData['decision']>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [error, setError] = useState<RoomLoadError | null>(null);
  const [refreshError, setRefreshError] = useState<RoomLoadError | null>(null);
  const [recoveryRegistrationError, setRecoveryRegistrationError] = useState<
    string | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const sessionSnapshotRef = useRef<{
    room: RoomDetailsResponse;
    data: RoomSessionData;
  } | null>(null);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const recoveryController = useMemo(
    () => createRoomAccessRecovery(roomId),
    [roomId]
  );
  const pollingStoppedRef = useRef(false);

  const loadRoom = useCallback(async () => {
    const previousSnapshot = sessionSnapshotRef.current?.room.room.id === roomId
      ? sessionSnapshotRef.current : null;
    if (!previousSnapshot) {
      setIsLoading(true);
      setRoom(null);
      setLatestScoreResult(null);
      setDecision(null);
      setAccessToken(null);
      setParticipantId(null);
      sessionSnapshotRef.current = null;
    }
    setError(null);
    if (!previousSnapshot) setRefreshError(null);
    setRecoveryRegistrationError(null);

    let token: string | null = null;
    try {
      token = window.sessionStorage.getItem(getRoomTokenStorageKey(roomId));
    } catch {
      const setLoadError = previousSnapshot ? setRefreshError : setError;
      setLoadError({
        title: '브라우저에 입장 정보를 저장할 수 없습니다.',
        message: '브라우저 설정을 확인한 뒤 다시 시도해 주세요.',
      });
      setIsLoading(false);
      return;
    }

    try {
      const loaded = await recoveryController.load(token);
      const response = loaded.room;
      token = loaded.token;
      const data = await loadRoomSessionData(response, token, previousSnapshot?.room ?? null, previousSnapshot?.data ?? null);
      sessionSnapshotRef.current = { room: response, data };
      setRoom(response);
      setLatestScoreResult(data.latestScoreResult);
      setDecision(data.decision);
      setAccessToken(token);
      setParticipantId(response.currentParticipant.id);
      setRefreshError(null);
      pollingStoppedRef.current = false;
      // 기존 참여자는 유효한 토큰으로 복구 수단을 등록하며 자동 재발급하지 않는다.
      await registerRoomRecovery(roomId, token)
        .then(({ recovery }) => {
          if (recovery.code)
            window.sessionStorage.setItem(
              getRoomRecoveryStorageKey(roomId),
              JSON.stringify(recovery)
            );
        })
        .catch(() => {
          setRecoveryRegistrationError(
            '개인 복구 파일을 받을 수 있는지 확인하지 못했어요. ‘개인 복구 파일 보관’을 누르거나 전에 받아 둔 파일을 확인해 주세요.'
          );
        });
    } catch (requestError) {
      if (previousSnapshot) {
        if (requestError instanceof RoomApiError && requestError.status === 401)
          pollingStoppedRef.current = true;
        setRefreshError(describeRoomError(requestError));
      } else {
        setError(describeRoomError(requestError));
      }
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
        const { room: response, token } =
          await recoveryController.load(accessToken);
        setAccessToken(token);
        const previousSnapshot = sessionSnapshotRef.current;
        const data = await loadRoomSessionData(
          response,
          token,
          previousSnapshot?.room ?? null,
          previousSnapshot?.data ?? null
        );
        sessionSnapshotRef.current = { room: response, data };
        setRoom(response);
        setParticipantId(response.currentParticipant.id);
        setLatestScoreResult(data.latestScoreResult);
        setDecision(data.decision);
        setRefreshError(null);
      } catch (requestError) {
        if (requestError instanceof RoomApiError && requestError.status === 401)
          pollingStoppedRef.current = true;
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
      if (document.visibilityState === 'visible') {
        void refreshRoom();
      }
    }

    const intervalId = window.setInterval(
      refreshWhenVisible,
      ROOM_REFRESH_INTERVAL_MS
    );
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
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
