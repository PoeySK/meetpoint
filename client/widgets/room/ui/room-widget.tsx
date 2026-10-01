"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RoomWorkspaceWidget } from "@/widgets/room-workspace";
import { RoomParticipantsWidget } from "@/widgets/room-participants";
import { useParticipantLifecycle } from "@/features/participant-lifecycle";
import { RoomRecoveryPanel } from "@/features/room-recovery";
import { ErrorView, LoadingView } from "./room-load-state";
import { RoomSummary } from "./room-summary";
import { useRoomSession } from "../model/use-room-session";
import {
  getRoomParticipantStorageKey,
  getRoomRecoveryStorageKey,
  getRoomTokenStorageKey,
} from "@/shared/lib/room-session";

export function RoomWidget({ roomId }: { roomId: string }) {
  const router = useRouter();
  const {
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
  } = useRoomSession(roomId);
  const handleLeft = useCallback(() => {
    try {
      window.sessionStorage.removeItem(getRoomTokenStorageKey(roomId));
      window.sessionStorage.removeItem(getRoomParticipantStorageKey(roomId));
      window.sessionStorage.removeItem(getRoomRecoveryStorageKey(roomId));
    } catch {
      // The room is already left on the Server; navigation still ends this session.
    }
    router.replace("/");
  }, [roomId, router]);
  const {
    handleKick,
    handleLeave,
    isLeaving,
    lifecycleError,
    lifecycleNotice,
    removingParticipantId,
  } = useParticipantLifecycle({
    onLeft: handleLeft,
    onRoomRefresh: refreshRoom,
    roomId,
    token: accessToken,
  });

  return (
    <main className="mp-page px-3 py-4 font-sans text-slate-950 sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <Link className="text-base font-bold tracking-tight" href="/">
            MeetPoint
          </Link>
          <span className="text-xs font-medium text-slate-400">모임 진행</span>
        </div>

        {isLoading && <LoadingView />}
        {!isLoading && error && (
          <>
            <ErrorView error={error} onRetry={() => void retryRoom()} />
            <RoomRecoveryPanel roomId={roomId} onRecovered={() => void loadRoom()} />
          </>
        )}
        {!isLoading && !error && room && (
          <div className="space-y-4">
            <RoomSummary room={room} />
            <RoomRecoveryPanel roomId={roomId} token={refreshError?.requiresRecovery ? null : accessToken} onRecovered={() => void loadRoom()} />
            {recoveryRegistrationError && <p aria-live="polite" className="text-sm text-amber-800">{recoveryRegistrationError}</p>}
            {refreshError && (
              <p
                aria-live="polite"
                className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-800"
              >
                최신 내용을 자동으로 불러오지 못했습니다. {refreshError.message}
              </p>
            )}
            {accessToken && participantId ? (
              <RoomWorkspaceWidget
                onRoomReload={refreshRoom}
                onRoomRefresh={refreshRoom}
                participantId={participantId}
                room={room}
                roomId={roomId}
                token={accessToken}
                decision={decision}
                latestScoreResult={latestScoreResult}
              />
            ) : (
              <section className="mp-card border-amber-100 bg-amber-50/80 p-4 text-sm leading-5 text-amber-800">
                이 브라우저에서 방 입장 정보를 찾을 수 없어 후보 등록과 의견 작성을
                사용할 수 없습니다. 개인 복구 수단으로 기존 참여자의 접근을 복구해 주세요.
              </section>
            )}
            <RoomParticipantsWidget
              actionError={lifecycleError}
              actionNotice={lifecycleNotice}
              currentParticipant={room.currentParticipant}
              isLeaving={isLeaving}
              onKick={handleKick}
              onLeave={handleLeave}
              removingParticipantId={removingParticipantId}
              room={room}
            />
          </div>
        )}
      </div>
    </main>
  );
}
