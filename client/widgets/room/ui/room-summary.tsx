'use client';

import type { DecisionPayload } from '@/entities/decision';
import type { RoomDetailsResponse, RoomStatus } from '@/entities/room';
import { DecisionSchedule } from '@/features/decision-confirmation';
import { useEffect, useRef, useState } from 'react';

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
  const confirmedHeadingRef = useRef<HTMLHeadingElement>(null);
  const wasConfirmed = useRef(isConfirmed);

  useEffect(() => {
    if (isConfirmed && !wasConfirmed.current) confirmedHeadingRef.current?.focus();
    wasConfirmed.current = isConfirmed;
  }, [isConfirmed]);

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

  if (isConfirmed) {
    const confirmedDecision = decision?.status === 'CONFIRMED' ? decision : null;

    return (
      <section
        aria-labelledby='room-confirmed-schedule-heading'
        className='mp-card mx-auto max-w-3xl scroll-mt-4 rounded-xl p-4 sm:p-7'
        id='room-confirmed-schedule'
        tabIndex={-1}
      >
        <header className='flex items-start gap-3.5 sm:gap-4'>
          <span aria-hidden='true' className='grid size-10 shrink-0 place-items-center rounded-lg bg-stone-100 text-xl font-bold text-stone-700'>✓</span>
          <div className='min-w-0 [overflow-wrap:anywhere]'>
            <p className='text-sm font-medium text-slate-600'>{room.room.title}</p>
            <h1
              className='mt-0.5 text-2xl font-bold tracking-tight text-slate-950 outline-none sm:text-3xl'
              id='room-confirmed-schedule-heading'
              ref={confirmedHeadingRef}
              tabIndex={-1}
            >
              {confirmedDecision ? '일정이 확정됐어요' : '확정 일정'}
            </h1>
          </div>
        </header>
        <div className='mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4 sm:mt-6 sm:p-5'>
          {confirmedDecision ? (
            <DecisionSchedule candidate={confirmedDecision.candidate} emphasized />
          ) : (
            <p className='text-sm text-slate-700'>일정 정보를 확인하려면 방을 다시 불러와 주세요.</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <header className='mp-card overflow-hidden'>
      <div className='flex flex-wrap items-start justify-between gap-x-4 gap-y-2 p-4 sm:px-6'>
        <div className='min-w-0'>
          <h1 className='text-xl font-bold tracking-tight text-slate-950 [overflow-wrap:anywhere] sm:text-2xl'>
            {room.room.title}
          </h1>
          <p className='mt-1 text-xs leading-5 text-slate-600 [overflow-wrap:anywhere] sm:text-sm'>
            방장 {room.hostParticipant.displayName} · 참여자 {room.participants.length}/{room.room.maxParticipants}명
          </p>
        </div>
        <span className='rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700'>
          {statusLabels[room.room.status]}
        </span>
      </div>

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
            className='mp-button mp-button-secondary px-2.5 py-2 text-xs text-slate-700'
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
