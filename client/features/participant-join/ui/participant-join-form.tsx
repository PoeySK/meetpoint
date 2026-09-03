'use client';

import { joinRoom } from '@/entities/room';
import { RoomApiError } from '@/shared/api/http-client';
import {
  getRoomParticipantStorageKey,
  getRoomTokenStorageKey,
} from '@/shared/lib/room-session';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

type ParticipantJoinFormProps = {
  initialRoomCode?: string;
};

type FieldErrors = {
  roomCode?: string;
  displayName?: string;
};

function validateForm(roomCode: string, displayName: string) {
  const errors: FieldErrors = {};

  if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
    errors.roomCode = '방 코드는 영문 대문자와 숫자 6자리로 입력해 주세요.';
  }

  if (!displayName) {
    errors.displayName = '이름을 입력해 주세요.';
  } else if (displayName.length > 30) {
    errors.displayName = '이름은 30자 이하로 입력해 주세요.';
  }

  return errors;
}

function describeJoinError(error: unknown) {
  if (error instanceof RoomApiError) {
    if (error.code === 'ROOM_NOT_FOUND_OR_INVALID_CODE') {
      return '방 코드를 확인해 주세요. 존재하지 않거나 입장할 수 없는 방입니다.';
    }

    if (error.code === 'ROOM_STATE_CONFLICT') {
      return '이 방은 현재 입장할 수 없습니다. 정원이 가득 찼거나 입장이 닫힌 방일 수 있습니다.';
    }

    if (error.code === 'VALIDATION_ERROR') {
      return '입력한 이름을 확인해 주세요.';
    }
  }

  return '방에 입장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

export function ParticipantJoinForm({
  initialRoomCode = '',
}: ParticipantJoinFormProps) {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState(initialRoomCode.toUpperCase());
  const [displayName, setDisplayName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedRoomCode = roomCode.trim().toUpperCase();
    const normalizedDisplayName = displayName.trim();
    const errors = validateForm(normalizedRoomCode, normalizedDisplayName);

    setFieldErrors(errors);
    setFormError('');

    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await joinRoom(normalizedRoomCode, {
        displayName: normalizedDisplayName,
      });

      try {
        window.sessionStorage.setItem(
          getRoomTokenStorageKey(response.room.id),
          response.access.participantToken
        );
        window.sessionStorage.setItem(
          getRoomParticipantStorageKey(response.room.id),
          response.participant.id
        );
      } catch {
        setFormError(
          '이 브라우저에 입장 정보를 저장할 수 없습니다. 브라우저 설정을 확인해 주세요.'
        );
        return;
      }

      router.push(`/rooms/${encodeURIComponent(response.room.id)}`);
    } catch (error) {
      setFormError(describeJoinError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className='mp-page px-4 py-5 font-sans text-slate-950 sm:px-6 sm:py-8'>
      <div className='mx-auto flex w-full max-w-lg flex-col gap-5'>
        <div className='flex items-center justify-between gap-4'>
          <Link className='text-lg font-bold tracking-tight' href='/'>
            MeetPoint
          </Link>
          <span className='text-xs font-medium text-slate-400'>방 입장</span>
        </div>

        <section className='mp-card mp-card-raised p-4 sm:p-6'>
          <div className='mb-5 space-y-1.5'>
            <p className='text-sm font-semibold text-emerald-700'>참여자</p>
            <h1 className='text-2xl font-semibold tracking-tight'>
              초대받은 방에 입장하기
            </h1>
            <p className='text-sm leading-6 text-slate-500'>
              방 코드와 이름을 입력하면 바로 대기 화면으로 이동합니다.
            </p>
          </div>

          <form className='space-y-4' onSubmit={handleSubmit} noValidate>
            <div className='space-y-2'>
              <label
                className='text-sm font-semibold text-slate-800'
                htmlFor='roomCode'
              >
                방 코드
              </label>
              <input
                aria-describedby={
                  fieldErrors.roomCode ? 'room-code-error' : undefined
                }
                aria-invalid={Boolean(fieldErrors.roomCode)}
                autoCapitalize='characters'
                autoComplete='off'
                className='mp-input text-lg font-semibold uppercase tracking-[0.2em] placeholder:normal-case placeholder:tracking-normal'
                id='roomCode'
                inputMode='text'
                maxLength={6}
                onChange={(event) =>
                  setRoomCode(event.target.value.toUpperCase())
                }
                placeholder='예: A7K9P2'
                value={roomCode}
              />
              {fieldErrors.roomCode && (
                <p className='text-sm text-rose-600' id='room-code-error'>
                  {fieldErrors.roomCode}
                </p>
              )}
            </div>

            <div className='space-y-2'>
              <label
                className='text-sm font-semibold text-slate-800'
                htmlFor='displayName'
              >
                이름
              </label>
              <input
                aria-describedby={
                  fieldErrors.displayName ? 'display-name-error' : undefined
                }
                aria-invalid={Boolean(fieldErrors.displayName)}
                autoComplete='nickname'
                className='mp-input'
                id='displayName'
                maxLength={30}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder='예: 지수'
                value={displayName}
              />
              {fieldErrors.displayName && (
                <p className='text-sm text-rose-600' id='display-name-error'>
                  {fieldErrors.displayName}
                </p>
              )}
            </div>

            {formError && (
              <p
                aria-live='polite'
                className='rounded-xl bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-700'
              >
                {formError}
              </p>
            )}

            <button
              className='mp-button mp-button-primary flex w-full items-center justify-center'
              disabled={isSubmitting}
              type='submit'
            >
              {isSubmitting ? '입장하는 중...' : '방에 입장하기'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
