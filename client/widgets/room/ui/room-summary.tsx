'use client';

import type {
  RoomDetailsResponse,
  RoomStatus,
} from '@/entities/room';
import { useState } from 'react';

const statusLabels: Record<RoomStatus, string> = {
  DRAFT: '준비 중',
  OPEN: '참여 가능',
  CALCULATING: '계산 중',
  CALCULATED: '계산 완료',
  CONFIRMED: '확정됨',
  CLOSED: '종료됨',
};

export function RoomSummary({ room }: { room: RoomDetailsResponse }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle'
  );

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(room.room.roomCode);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <>
      <section className='mp-card mp-card-raised p-4 sm:p-6'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
          <div className='space-y-3'>
            <span className='inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700'>
              {statusLabels[room.room.status]}
            </span>
            <div>
              <p className='text-sm font-semibold text-emerald-700'>방 대기</p>
              <h1 className='mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl'>
                {room.room.title}
              </h1>
            </div>
          </div>

          <div className='rounded-xl bg-slate-950 p-3 text-white sm:min-w-36 sm:text-right'>
            <p className='text-xs font-semibold uppercase tracking-[0.18em] text-slate-400'>
              방 코드
            </p>
            <p className='mt-1 text-2xl font-bold tracking-[0.16em]'>
              {room.room.roomCode}
            </p>
            <button
              className='mt-2 rounded-lg border border-white/20 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-300'
              onClick={copyRoomCode}
              type='button'
            >
              {copyState === 'copied' ? '복사됨' : '코드 복사'}
            </button>
          </div>
        </div>
        {copyState === 'failed' && (
          <p className='mt-4 text-sm text-rose-600'>
            코드를 자동으로 복사하지 못했습니다. 코드를 직접 선택해 복사해
            주세요.
          </p>
        )}
      </section>

      <section className='grid gap-3 sm:grid-cols-3'>
        <div className='mp-card p-3.5'>
          <p className='text-sm text-slate-500'>호스트</p>
          <p className='mt-2 font-semibold text-slate-950'>
            {room.hostParticipant.displayName}
          </p>
          <p className='mt-1 text-xs text-emerald-700'>호스트</p>
        </div>
        <div className='mp-card p-3.5'>
          <p className='text-sm text-slate-500'>참여자</p>
          <p className='mt-2 font-semibold text-slate-950'>
            {room.participants.length}명
          </p>
          <p className='mt-1 text-xs text-slate-500'>
            최대 {room.room.maxParticipants}명
          </p>
        </div>
        <div className='mp-card p-3.5'>
          <p className='text-sm text-slate-500'>현재 단계</p>
          <p className='mt-2 font-semibold text-slate-950'>
            {room.room.status === 'CONFIRMED'
              ? '후보 확정'
              : room.room.status === 'CALCULATED'
                ? '결정 대기 중'
                : room.room.status === 'CALCULATING'
                  ? '계산 진행 중'
                  : '참여자 기다리는 중'}
          </p>
          <p className='mt-1 text-xs text-slate-500'>
            {room.room.status === 'CONFIRMED'
              ? '참여자는 확정 결과를 조회할 수 있습니다'
              : room.room.status === 'CALCULATED'
                ? '호스트가 후보를 직접 선택합니다'
                : '입력과 계산을 준비하는 단계입니다'}
          </p>
        </div>
      </section>

    </>
  );
}
