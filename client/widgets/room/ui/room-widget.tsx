'use client';

import { useParticipantLifecycle } from '@/features/participant-lifecycle';
import { RoomRecoveryPanel } from '@/features/room-recovery';
import {
  getRoomParticipantStorageKey,
  getRoomRecoveryStorageKey,
  getRoomTokenStorageKey,
} from '@/shared/lib/room-session';
import { MeetPointBrand } from '@/shared/ui/meetpoint-brand';
import { RoomParticipantsWidget } from '@/widgets/room-participants';
import { RoomWorkspaceWidget } from '@/widgets/room-workspace';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { useRoomSession } from '../model/use-room-session';
import { ErrorView, LoadingView } from './room-load-state';
import { RoomSummary } from './room-summary';

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
      // 서버의 탈퇴는 완료됐으므로 저장소 정리 실패와 관계없이 화면을 이동한다.
    }
    router.replace('/');
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

  const requiresRecovery = Boolean(refreshError?.requiresRecovery) || !accessToken;
  const isConfirmed = room?.room.status === 'CONFIRMED';
  const roomTools = !requiresRecovery && (
    <details className='mp-card group' open={Boolean(recoveryRegistrationError)}>
      <summary className='flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-slate-600 [&::-webkit-details-marker]:hidden'>
        방 다시 열기와 복구
        <span aria-hidden='true' className='transition-transform group-open:rotate-180'>⌄</span>
      </summary>
      <div className='space-y-3 border-t border-slate-200 px-3 py-3'>
        {recoveryRegistrationError && (
          <p aria-live='polite' className='text-sm text-slate-700'>{recoveryRegistrationError}</p>
        )}
        <RoomRecoveryPanel roomId={roomId} token={accessToken} onRecovered={() => void loadRoom()} />
        {!refreshError && (
          <button type='button' className='mp-button mp-button-secondary' onClick={() => void retryRoom()}>
            다시 불러오기
          </button>
        )}
      </div>
    </details>
  );

  return (
    <div className='mp-appointment mp-page'>
      <header className='mp-shell py-4 sm:py-6'>
        <MeetPointBrand />
      </header>

      <main className='mp-shell pb-10'>
        {isLoading && <LoadingView />}
        {!isLoading && error && (
          <ErrorView
            error={error}
            onRetry={() => void retryRoom()}
            recovery={<RoomRecoveryPanel roomId={roomId} onRecovered={() => void loadRoom()} />}
          />
        )}
        {!isLoading && !error && room && (
          <div className='space-y-4 sm:space-y-5'>
            <RoomSummary decision={decision} room={room} />
            {refreshError && (
              <div className='space-y-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm leading-5 text-slate-700'>
                <p aria-live='polite'>최신 방 정보를 불러오지 못했습니다. {refreshError.message}</p>
                <button type='button' className='mp-button mp-button-secondary' onClick={() => void retryRoom()}>
                  다시 불러오기
                </button>
              </div>
            )}
            {requiresRecovery && (
              <RoomRecoveryPanel roomId={roomId} token={null} onRecovered={() => void loadRoom()} />
            )}
            <details className='group/confirmed' open={!isConfirmed}>
              <summary
                className={`mp-card mx-auto max-w-3xl cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-slate-600 [&::-webkit-details-marker]:hidden ${isConfirmed ? 'flex' : 'hidden'}`}
              >
                <span>추천 근거와 방 관리</span>
                <span aria-hidden='true' className='transition-transform group-open/confirmed:rotate-180 motion-reduce:transition-none'>⌄</span>
              </summary>
              <div className={isConfirmed ? 'mt-3 space-y-3' : 'space-y-3'}>
                {accessToken && participantId ? (
                  <RoomWorkspaceWidget
                    onRoomReload={refreshRoom}
                    onRoomRefresh={refreshRoom}
                    participantId={participantId}
                    room={room}
                    roomId={roomId}
                    roomTools={roomTools}
                    token={accessToken}
                    decision={decision}
                    latestScoreResult={latestScoreResult}
                  />
                ) : (
                  <section className='mp-card border-slate-200 bg-slate-50 p-4 text-sm leading-5 text-slate-700'>
                    후보를 올리거나 의견을 남기려면 개인 복구 코드로 방을 다시 열어 주세요.
                  </section>
                )}
                <div className='scroll-mt-4' id='room-participants' tabIndex={-1}>
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
              </div>
            </details>
          </div>
        )}
      </main>
    </div>
  );
}
