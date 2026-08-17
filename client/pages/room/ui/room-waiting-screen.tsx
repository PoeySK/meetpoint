"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RoomWorkspaceWidget } from "@/widgets/room-workspace/ui/room-workspace-widget";
import { RoomParticipantsWidget } from "@/widgets/room-participants/ui/room-participants-widget";
import { useParticipantLifecycle } from "@/features/participant-lifecycle/model/use-participant-lifecycle";
import { ErrorView, LoadingView } from "@/pages/room/ui/room-load-state";
import { RoomSummary } from "@/pages/room/ui/room-summary";
import { useRoomSession } from "@/pages/room/model/use-room-session";
import {
  getRoomParticipantStorageKey,
  getRoomTokenStorageKey,
} from "@/shared/lib/room-session";

export default function RoomWaitingScreen({ roomId }: { roomId: string }) {
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
    refreshRoom,
    room,
  } = useRoomSession(roomId);
  const handleLeft = useCallback(() => {
    try {
      window.sessionStorage.removeItem(getRoomTokenStorageKey(roomId));
      window.sessionStorage.removeItem(getRoomParticipantStorageKey(roomId));
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
    <main className="min-h-screen bg-[#f6f7f3] px-4 py-8 font-sans text-slate-950 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link className="text-lg font-bold tracking-tight" href="/">
            MeetPoint
          </Link>
          <span className="text-xs font-medium text-slate-400">방 대기</span>
        </div>

        {isLoading && <LoadingView />}
        {!isLoading && error && (
          <ErrorView error={error} onRetry={() => void loadRoom()} />
        )}
        {!isLoading && !error && room && (
          <div className="space-y-5">
            <RoomSummary room={room} />
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
            {refreshError && (
              <p
                aria-live="polite"
                className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800"
              >
                자동 갱신에 실패했습니다. {refreshError.message}
              </p>
            )}
            {accessToken && participantId ? (
              <RoomWorkspaceWidget
                onCandidateCreated={() => void refreshRoom()}
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
              <section className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-sm leading-6 text-amber-800">
                이 브라우저에서 참여자 정보를 찾을 수 없어 후보 등록과 응답을 사용할 수
                없습니다. 방 코드로 다시 입장하면 계속할 수 있습니다.
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
