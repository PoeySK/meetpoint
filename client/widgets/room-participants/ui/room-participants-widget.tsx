'use client';

import type {
  ParticipantStatus,
  PublicParticipant,
  RoomDetailsResponse,
} from '@/entities/room';
import { useState } from 'react';

const roleLabels: Record<PublicParticipant['role'], string> = {
  HOST: '방장',
  MEMBER: '참여자',
};

const statusLabels: Record<ParticipantStatus, string> = {
  JOINED: '입장함',
  RESPONDED: '의견 작성 완료',
  LEFT: '나감',
  REMOVED: '참여 제외',
};

export function RoomParticipantsWidget({
  currentParticipant,
  room,
  onLeave,
  onKick,
  isLeaving,
  removingParticipantId,
  actionError,
  actionNotice,
}: {
  currentParticipant: PublicParticipant;
  room: RoomDetailsResponse;
  onLeave: () => Promise<void>;
  onKick: (participantId: string, displayName: string) => Promise<void>;
  isLeaving: boolean;
  removingParticipantId: string | null;
  actionError: string | null;
  actionNotice: string | null;
}) {
  const [kickConfirmationId, setKickConfirmationId] = useState<string | null>(
    null
  );
  const canChangeParticipants = ![
    'CALCULATING',
    'CONFIRMED',
    'CLOSED',
  ].includes(room.room.status);
  const isHost = currentParticipant.role === 'HOST';

  function cancelKick() {
    setKickConfirmationId(null);
  }

  return (
    <section
      aria-labelledby='room-participants-heading'
      className='mp-card mp-card-raised p-4 sm:p-6'
    >
      <div className='flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <p className='text-sm font-semibold text-emerald-700'>참여자</p>
          <h2
            className='mt-1 text-xl font-semibold tracking-tight text-slate-950'
            id='room-participants-heading'
          >
            함께하는 사람
          </h2>
        </div>
        <p className='text-sm text-slate-500'>
          {room.participants.length} / {room.room.maxParticipants}명
        </p>
      </div>

      <div className='mt-4 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <p>
            <span className='font-semibold'>
              {currentParticipant.displayName}
            </span>
            님으로 입장했습니다. ({roleLabels[currentParticipant.role]})
          </p>
          {!isHost && (
            <button
              className='mp-button mp-button-secondary w-fit border-emerald-700 px-3 py-1.5 text-xs text-emerald-800 hover:border-emerald-700 hover:bg-emerald-100'
              disabled={
                !canChangeParticipants ||
                isLeaving ||
                Boolean(removingParticipantId)
              }
              onClick={() => void onLeave()}
              type='button'
            >
              {isLeaving ? '나가는 중...' : '방 나가기'}
            </button>
          )}
        </div>
      </div>

      {!canChangeParticipants && (
        <p className='mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-800'>
          추천 결과를 만드는 중이거나 일정이 확정되면 함께하는 사람을 바꿀 수 없습니다.
        </p>
      )}

      {(actionError || actionNotice) && (
        <p
          aria-live='polite'
          className={`mt-3 rounded-xl px-3 py-2.5 text-sm leading-5 ${
            actionError
              ? 'bg-rose-50 text-rose-700'
              : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          {actionError ?? actionNotice}
        </p>
      )}

      <ul className='mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
        {room.participants.map((participant) => {
          const isCurrentParticipant = participant.id === currentParticipant.id;

          return (
            <li
              className='flex items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-slate-50/35 px-3 py-2.5'
              key={participant.id}
            >
              <div className='min-w-0'>
                <p className='truncate font-semibold text-slate-950'>
                  {participant.displayName}
                  {isCurrentParticipant && (
                    <span className='ml-2 text-xs font-semibold text-emerald-700'>
                      나
                    </span>
                  )}
                </p>
                <p className='mt-1 text-xs text-slate-500'>
                  {roleLabels[participant.role]}
                </p>
              </div>
              <div className='flex shrink-0 flex-col items-end gap-2'>
                <span className='rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600'>
                  {statusLabels[participant.status]}
                </span>
                {isHost &&
                  participant.role === 'MEMBER' &&
                  (kickConfirmationId === participant.id ? (
                    <div className='flex gap-1.5'>
                      <button
                        className='rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-50'
                        disabled={
                          Boolean(removingParticipantId) ||
                          !canChangeParticipants
                        }
                        onClick={() => {
                          setKickConfirmationId(null);
                          void onKick(participant.id, participant.displayName);
                        }}
                        type='button'
                      >
                        {removingParticipantId === participant.id
                          ? '처리 중...'
                          : '내보내기 확인'}
                      </button>
                      <button
                        className='rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-500 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-50'
                        disabled={Boolean(removingParticipantId)}
                        onClick={cancelKick}
                        type='button'
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      className='rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-50'
                      disabled={
                        !canChangeParticipants ||
                        isLeaving ||
                        Boolean(removingParticipantId)
                      }
                      onClick={() => setKickConfirmationId(participant.id)}
                      type='button'
                    >
                      내보내기
                    </button>
                  ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
