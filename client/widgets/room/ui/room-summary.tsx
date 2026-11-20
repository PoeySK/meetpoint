'use client';

import type { DecisionPayload } from '@/entities/decision';
import type { RoomDetailsResponse, RoomStatus } from '@/entities/room';
import { DecisionSchedule } from '@/features/decision-confirmation';
import { useState } from 'react';

const statusLabels: Record<RoomStatus, string> = {
  DRAFT: '준비 중',
  OPEN: '의견 받는 중',
  CALCULATING: '추천 결과 준비 중',
  CALCULATED: '추천 결과 확인',
  CONFIRMED: '일정 확정',
  CLOSED: '종료됨',
};

export function RoomSummary({
  room,
  decision,
}: {
  room: RoomDetailsResponse;
  decision: DecisionPayload | null;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [inviteCopyState, setInviteCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const isConfirmed = room.room.status === 'CONFIRMED';

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(room.room.roomCode);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  async function copyInviteLink() {
    try {
      const inviteUrl = window.location.origin + '/join/' + encodeURIComponent(room.room.roomCode);
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopyState('copied');
    } catch {
      setInviteCopyState('failed');
    }
  }

  return (
    <header className='mp-card mp-card-raised overflow-hidden'>
      <div className='flex flex-wrap items-start justify-between gap-x-4 gap-y-2 p-4 sm:px-6'>
        <div className='min-w-0'>
          <h1 className='text-xl font-bold tracking-tight text-slate-950 [overflow-wrap:anywhere] sm:text-2xl'>
            {room.room.title}
          </h1>
          <p className='mt-1 text-xs leading-5 text-slate-600 [overflow-wrap:anywhere] sm:text-sm'>
            방장 {room.hostParticipant.displayName} · 참여자 {room.participants.length}/{room.room.maxParticipants}명
          </p>
        </div>
        <span className='rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800'>
          {statusLabels[room.room.status]}
        </span>
      </div>

      {isConfirmed && (
        <section
          aria-labelledby='room-confirmed-schedule-heading'
          className='mx-3 mb-3 scroll-mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3.5 sm:mx-5 sm:p-4'
          id='room-confirmed-schedule'
          tabIndex={-1}
        >
          <h2 className='mb-3 text-base font-bold text-emerald-950' id='room-confirmed-schedule-heading'>
            {decision?.status === 'CONFIRMED'
              ? '방장이 일정을 확정했습니다'
              : '확정 일정'}
          </h2>
          {decision?.status === 'CONFIRMED' ? (
            <DecisionSchedule candidate={decision.candidate} />
          ) : (
            <p className='text-sm text-slate-700'>일정 정보를 확인하려면 방을 다시 불러와 주세요.</p>
          )}
        </section>
      )}

      <div className='border-t border-slate-100 px-4 py-2.5 sm:px-6'>
        <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
          <p className='mr-auto text-xs font-medium text-slate-600'>
            방 코드 <strong className='ml-1 font-mono text-sm tracking-wider text-slate-950'>{room.room.roomCode}</strong>
          </p>
          <button
            className='mp-button mp-button-secondary px-2.5 py-2 text-xs'
            onClick={copyRoomCode}
            type='button'
          >
            {copyState === 'copied' ? '코드 복사됨' : '코드 복사'}
          </button>
          <button
            className='mp-button mp-button-secondary px-2.5 py-2 text-xs text-emerald-800'
            onClick={copyInviteLink}
            type='button'
          >
            {inviteCopyState === 'copied' ? '링크 복사됨' : '초대 링크 복사'}
          </button>
        </div>
        {copyState === 'failed' && (
          <p className='mt-2 text-xs text-rose-700' role='status'>
            자동 복사에 실패했습니다. 방 코드를 직접 선택해 복사해 주세요.
          </p>
        )}
        {inviteCopyState === 'failed' && (
          <p className='mt-2 text-xs text-rose-700' role='status'>
            초대 링크를 복사하지 못했습니다. 방 코드를 공유해 주세요.
          </p>
        )}
      </div>
    </header>
  );
}
