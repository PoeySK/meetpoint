'use client';

import { joinRoom } from '@/entities/room';
import { RoomApiError } from '@/shared/api/http-client';
import {
  getRoomRecoveryStorageKey,
  getRoomParticipantStorageKey,
  getRoomTokenStorageKey,
  rememberRoomAddress,
  getRememberedRoomAddress,
} from '@/shared/lib/room-session';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef, type FormEvent } from 'react';

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

function describeJoinError(error: unknown, hasInviteCode: boolean) {
  if (error instanceof RoomApiError && error.status === 429) return error.message;
  if (error instanceof RoomApiError) {
    if (error.code === 'ROOM_NOT_FOUND_OR_INVALID_CODE') {
      return hasInviteCode
        ? '초대 링크로 방을 찾을 수 없어요. 방장에게 새 링크를 요청해 주세요.'
        : '입장할 수 있는 방을 찾지 못했어요. 입력한 방 코드를 확인해 주세요.';
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
  const inviteCode = initialRoomCode.toUpperCase();
  const hasInviteCode = /^[A-Z0-9]{6}$/.test(inviteCode);
  const [roomCode, setRoomCode] = useState(hasInviteCode ? inviteCode : '');
  const [displayName, setDisplayName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingRoomId, setExistingRoomId] = useState<string | null>();
  const [joiningAsNew, setJoiningAsNew] = useState(false);
  const displayNameRef = useRef<HTMLInputElement>(null);
  const checkingInvite = hasInviteCode && existingRoomId === undefined;
  const showJoinForm = !hasInviteCode || (!checkingInvite && (!existingRoomId || joiningAsNew));
  useEffect(() => {
    const timer = window.setTimeout(() => setExistingRoomId(getRememberedRoomAddress(roomCode.trim().toUpperCase())), 0);
    return () => window.clearTimeout(timer);
  }, [roomCode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedRoomCode = roomCode.trim().toUpperCase();
    const normalizedDisplayName = displayName.trim();
    const errors = validateForm(normalizedRoomCode, normalizedDisplayName);

    setFieldErrors(errors);
    setFormError('');

    if (Object.keys(errors).length > 0) {
      const form = event.currentTarget;
      window.requestAnimationFrame(() => form.querySelector<HTMLInputElement>(errors.roomCode ? '#roomCode' : '#displayName')?.focus());
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

      try { window.sessionStorage.setItem(getRoomRecoveryStorageKey(response.room.id), JSON.stringify(response.recovery)); } catch { /* 복구 쿠키는 계속 사용할 수 있다. */ }
      rememberRoomAddress(response.room.roomCode, response.room.id);
      router.push(`/rooms/${encodeURIComponent(response.room.id)}`);
    } catch (error) {
      setFormError(describeJoinError(error, hasInviteCode));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className='mp-page px-3 py-4 font-sans text-slate-950 sm:px-6 sm:py-6'>
      <div className='mx-auto w-full max-w-lg space-y-3'>
        <header>
          <Link className='font-bold tracking-tight' href='/'>
            MeetPoint
          </Link>
        </header>

        <section aria-labelledby='join-room-heading' className='mp-card space-y-5 rounded-xl p-4 sm:p-6'>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl' id='join-room-heading'>
            {hasInviteCode ? '모임에 참여하기' : '방 코드로 참여하기'}
          </h1>
          {checkingInvite && <p className='text-sm text-slate-600' role='status'>참여 기록을 확인하는 중…</p>}
          {initialRoomCode && !hasInviteCode && (
            <p className='rounded-lg bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-700' role='alert'>
              초대 링크의 방 코드를 읽을 수 없어요. 코드를 직접 입력하거나 방장에게 새 링크를 요청해 주세요.
            </p>
          )}
          {existingRoomId && (
            <div className={`space-y-3 ${showJoinForm ? 'border-b border-slate-200 pb-4' : ''}`}>
              <p className='text-sm text-slate-700'>이미 이 모임에 참여한 기록이 있어요.</p>
              <Link
                className={`mp-button flex min-h-11 w-full items-center justify-center rounded-lg ${showJoinForm ? 'mp-button-secondary' : 'mp-button-accent'}`}
                href={`/rooms/${encodeURIComponent(existingRoomId)}`}
              >
                기존 참여 이어가기
              </Link>
              {!showJoinForm && (
                <button
                  className='mp-button mp-button-secondary min-h-11 w-full rounded-lg'
                  onClick={() => {
                    setJoiningAsNew(true);
                    window.requestAnimationFrame(() => displayNameRef.current?.focus());
                  }}
                  type='button'
                >
                  새 참여자로 입장
                </button>
              )}
            </div>
          )}

          {showJoinForm && (
            <form className='space-y-4' onSubmit={handleSubmit} noValidate>
              {!hasInviteCode && (
                <div className='grid gap-1.5'>
                  <label className='text-sm font-semibold text-slate-800' htmlFor='roomCode'>방 코드</label>
                  <input
                    aria-describedby={fieldErrors.roomCode ? 'room-code-error' : undefined}
                    aria-invalid={Boolean(fieldErrors.roomCode)}
                    autoCapitalize='characters'
                    autoComplete='off'
                    className='mp-input min-h-11 rounded-lg text-base font-semibold uppercase tracking-[0.2em] placeholder:normal-case placeholder:tracking-normal aria-invalid:border-rose-600'
                    id='roomCode'
                    maxLength={6}
                    onChange={(event) => {
                      setRoomCode(event.target.value.toUpperCase());
                      if (fieldErrors.roomCode) setFieldErrors((errors) => ({ ...errors, roomCode: undefined }));
                    }}
                    placeholder='예: A7K9P2'
                    required
                    value={roomCode}
                  />
                  {fieldErrors.roomCode && <p className='text-sm text-rose-600' id='room-code-error'>{fieldErrors.roomCode}</p>}
                </div>
              )}

              <div className='grid gap-1.5'>
                <label className='text-sm font-semibold text-slate-800' htmlFor='displayName'>이름</label>
                <input
                  aria-describedby={fieldErrors.displayName ? 'display-name-error join-name-hint' : 'join-name-hint'}
                  aria-invalid={Boolean(fieldErrors.displayName)}
                  autoComplete='nickname'
                  className='mp-input min-h-11 rounded-lg text-base aria-invalid:border-rose-600'
                  id='displayName'
                  maxLength={30}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    if (fieldErrors.displayName) setFieldErrors((errors) => ({ ...errors, displayName: undefined }));
                  }}
                  placeholder='예: 지수'
                  ref={displayNameRef}
                  required
                  value={displayName}
                />
                {fieldErrors.displayName && <p className='text-sm text-rose-600' id='display-name-error'>{fieldErrors.displayName}</p>}
                <p className='text-xs leading-5 text-slate-600' id='join-name-hint'>방장과 다른 참가자에게 보이는 이름이에요.</p>
              </div>

              {formError && (
                <p className='rounded-lg bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-700' role='alert'>
                  {formError}
                </p>
              )}
              <button
                className='mp-button mp-button-accent min-h-11 w-full rounded-lg'
                disabled={isSubmitting}
                type='submit'
              >
                {isSubmitting ? '입장하는 중...' : '방에 입장하기'}
              </button>
              <p className='break-keep text-sm leading-5 text-slate-600'>
                입장하면 방장이 올린 모임 후보에 의견을 남길 수 있어요.
              </p>
            </form>
          )}
        </section>
        {hasInviteCode && (
          <Link className='inline-flex min-h-11 items-center rounded-lg px-1 text-sm font-semibold text-slate-800 underline underline-offset-4' href='/join'>
            다른 방 코드 입력
          </Link>
        )}
      </div>
    </main>
  );
}
