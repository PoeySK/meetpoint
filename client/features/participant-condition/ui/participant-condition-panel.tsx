'use client';

import { upsertParticipantCondition } from '@/entities/participant-condition';
import type { ParticipantCondition } from '@/entities/participant-condition';
import { RoomApiError } from '@/shared/api/http-client';
import { getRoomAccessErrorMessage } from '@/shared/lib/room-access-error';
import { MEETPOINT_TIMEZONE } from '@/shared/config/meetpoint';
import { useEffect, useRef, useState, type FormEvent } from 'react';

type ConditionWindowDraft = {
  date: string;
  startsAt: string;
  endsAt: string;
};

type FieldErrors = {
  windows?: string;
  budget?: string;
  preferences?: string;
  windowErrors: Partial<Record<number, { field: keyof ConditionWindowDraft; message: string }>>;
};

type ParticipantConditionPanelProps = {
  roomId: string;
  token: string;
  participantId: string;
  condition: ParticipantCondition | null;
  isReadOnly?: boolean;
  onRoomRefresh: () => Promise<void>;
};

const EMPTY_ERRORS: FieldErrors = { windowErrors: {} };

function emptyWindow(): ConditionWindowDraft {
  return { date: '', startsAt: '', endsAt: '' };
}

function conditionWindowsToDraft(
  condition: ParticipantCondition | null,
): ConditionWindowDraft[] {
  if (!condition) {
    return [emptyWindow()];
  }

  return condition.availabilityWindows.map((window) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      month: '2-digit',
      timeZone: MEETPOINT_TIMEZONE,
      year: 'numeric',
    }).formatToParts(new Date(window.startsAt));
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? '';
    const end = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      timeZone: MEETPOINT_TIMEZONE,
    }).formatToParts(new Date(window.endsAt));
    const getEnd = (type: string) =>
      end.find((part) => part.type === type)?.value ?? '';

    return {
      date: `${get('year')}-${get('month')}-${get('day')}`,
      startsAt: `${get('hour')}:${get('minute')}`,
      endsAt: `${getEnd('hour')}:${getEnd('minute')}`,
    };
  });
}

function toKstTimestamp(date: string, time: string) {
  return `${date}T${time}:00+09:00`;
}

function parseTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function validateDraft(
  windows: ConditionWindowDraft[],
  budget: string,
  noBudgetLimit: boolean,
  requiredTags: string,
  preferredTags: string,
  avoidTags: string,
): FieldErrors {
  const errors: FieldErrors = { windowErrors: {} };
  if (windows.length < 1 || windows.length > 10) {
    errors.windows = '가능 시간은 1~10개까지 입력해 주세요.';
  }

  windows.forEach((window, index) => {
    const missingField = !window.date ? 'date' : !window.startsAt ? 'startsAt' : !window.endsAt ? 'endsAt' : null;
    if (missingField) {
      errors.windowErrors[index] = {
        field: missingField,
        message: '날짜와 시작·종료 시간을 모두 입력해 주세요.',
      };
    } else if (window.endsAt <= window.startsAt) {
      errors.windowErrors[index] = {
        field: 'endsAt',
        message: '종료 시간은 시작 시간보다 늦어야 해요.',
      };
    }
  });

  if (
    !noBudgetLimit &&
    (!budget.trim() || !Number.isInteger(Number(budget)) || Number(budget) < 0)
  ) {
    errors.budget = '예산은 0원 이상의 정수로 입력하거나 제한 없음을 선택해 주세요.';
  }

  const groups = [
    parseTags(requiredTags),
    parseTags(preferredTags),
    parseTags(avoidTags),
  ];
  const allTags = groups.flat();
  if (
    groups.some((group) => group.length > 10) ||
    allTags.some((tag) => tag.length > 50) ||
    new Set(allTags.map((tag) => tag.toUpperCase())).size !== allTags.length
  ) {
    errors.preferences =
      '특징은 종류별로 최대 10개까지 입력할 수 있고 중복해서 사용할 수 없습니다.';
  }

  return errors;
}

function describeConditionError(error: unknown) {
  if (error instanceof RoomApiError && error.status === 429) return error.message;
  const accessMessage = getRoomAccessErrorMessage(error);
  if (accessMessage) return accessMessage;
  if (error instanceof RoomApiError) {
    if (error.code === 'CONDITION_INCOMPLETE') {
      return '가능한 시간·예산·특징 입력을 다시 확인해 주세요.';
    }
    if (error.code === 'ROOM_STATE_CONFLICT') {
      return '일정이 확정되었거나 종료된 방에서는 선택 조건을 수정할 수 없습니다.';
    }
  }

  return '선택 조건을 저장하지 못했습니다. 입력은 남아 있으니 잠시 후 다시 시도해 주세요.';
}

export function ParticipantConditionPanel({
  roomId,
  token,
  participantId,
  condition,
  isReadOnly = false,
  onRoomRefresh,
}: ParticipantConditionPanelProps) {
  const [windows, setWindows] = useState<ConditionWindowDraft[]>(() =>
    conditionWindowsToDraft(condition),
  );
  const [noBudgetLimit, setNoBudgetLimit] = useState(
    condition?.maxBudgetKrw === null || condition === null,
  );
  const [budget, setBudget] = useState(
    condition?.maxBudgetKrw === null || condition === null
      ? ''
      : String(condition.maxBudgetKrw),
  );
  const [requiredTags, setRequiredTags] = useState(
    condition?.preferences.requiredTags.join(', ') ?? '',
  );
  const [preferredTags, setPreferredTags] = useState(
    condition?.preferences.preferredTags.join(', ') ?? '',
  );
  const [avoidTags, setAvoidTags] = useState(
    condition?.preferences.avoidTags.join(', ') ?? '',
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(EMPTY_ERRORS);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hydratedKeyRef = useRef<string | null>(null);
  const extraConditionsRef = useRef<HTMLDetailsElement>(null);
  const conditionKey = `${participantId}:${condition?.updatedAt ?? 'empty'}`;

  useEffect(() => {
    if (hydratedKeyRef.current === conditionKey) {
      return;
    }
    hydratedKeyRef.current = conditionKey;
    setWindows(conditionWindowsToDraft(condition));
    setNoBudgetLimit(condition?.maxBudgetKrw === null || condition === null);
    setBudget(
      condition?.maxBudgetKrw === null || condition === null
        ? ''
        : String(condition.maxBudgetKrw),
    );
    setRequiredTags(condition?.preferences.requiredTags.join(', ') ?? '');
    setPreferredTags(condition?.preferences.preferredTags.join(', ') ?? '');
    setAvoidTags(condition?.preferences.avoidTags.join(', ') ?? '');
    setFieldErrors(EMPTY_ERRORS);
    setFormMessage(null);
  }, [condition, conditionKey]);

  function updateWindow(
    index: number,
    update: Partial<ConditionWindowDraft>,
  ) {
    setWindows((current) =>
      current.map((window, windowIndex) =>
        windowIndex === index ? { ...window, ...update } : window,
      ),
    );
    setFieldErrors((current) => ({
      ...current,
      windows: undefined,
      windowErrors: { ...current.windowErrors, [index]: undefined },
    }));
    setFormMessage(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateDraft(
      windows,
      budget,
      noBudgetLimit,
      requiredTags,
      preferredTags,
      avoidTags,
    );
    setFieldErrors(errors);
    setFormMessage(null);
    if ((errors.budget || errors.preferences) && extraConditionsRef.current) {
      extraConditionsRef.current.open = true;
    }
    if (
      errors.windows ||
      errors.budget ||
      errors.preferences ||
      Object.values(errors.windowErrors).some(Boolean)
    ) {
      const form = event.currentTarget;
      window.requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }

    const input = {
      availabilityWindows: windows.map((window) => ({
        startsAt: toKstTimestamp(window.date, window.startsAt),
        endsAt: toKstTimestamp(window.date, window.endsAt),
      })),
      maxBudgetKrw: noBudgetLimit ? null : Number(budget),
      preferences: {
        requiredTags: parseTags(requiredTags).map((tag) => tag.toUpperCase()),
        preferredTags: parseTags(preferredTags).map((tag) => tag.toUpperCase()),
        avoidTags: parseTags(avoidTags).map((tag) => tag.toUpperCase()),
      },
    };

    setIsSubmitting(true);
    void upsertParticipantCondition(roomId, participantId, token, input)
      .then(async () => {
        setFormMessage('선택 조건을 저장했습니다. 추천 결과에 참고로 반영됩니다.');
        await onRoomRefresh();
      })
      .catch((error: unknown) => {
        setFormMessage(describeConditionError(error));
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }

  return (
    <section className='p-4 sm:p-6 lg:border-t lg:border-[var(--mp-line)]'>
      <div className='space-y-1.5'>
        <h2 className='text-xl font-semibold tracking-tight'>
          원하는 조건을 알려주세요
        </h2>
        <p className='break-keep text-sm leading-6 text-[var(--mp-muted)]'>
          후보를 비교할 때 참고해요. 입력은 선택이고 나만 볼 수 있어요.
        </p>
      </div>

      {isReadOnly ? (
        <p className='mt-4 rounded-xl bg-white px-3 py-2.5 text-sm leading-5 text-slate-600'>
          일정이 확정되었거나 종료된 방에서는 선택 조건을 수정할 수 없습니다.
        </p>
      ) : (
        <form className='mt-4 space-y-4 sm:space-y-5' onSubmit={handleSubmit} noValidate>
          <fieldset className='space-y-3'>
            <legend className='mb-2 font-bold'>가능한 시간</legend>
            {windows.map((window, index) => (
              <div
                className={index > 0 ? 'border-t border-[var(--mp-line)] pt-3' : undefined}
                key={`condition-window-${index}`}
              >
                {windows.length > 1 && (
                  <div className='mb-1 flex items-center justify-between gap-2'>
                    <p className='text-sm font-medium text-[var(--mp-muted)]'>시간 {index + 1}</p>
                    <button
                      aria-label={`시간 ${index + 1} 삭제`}
                      className='min-h-11 px-2 text-sm font-semibold text-[var(--mp-muted)] underline-offset-4 hover:underline disabled:opacity-50'
                      disabled={isSubmitting}
                      onClick={() => {
                        setWindows((current) =>
                          current.filter((_, windowIndex) => windowIndex !== index),
                        );
                        setFieldErrors((current) => ({ ...current, windowErrors: {} }));
                      }}
                      type='button'
                    >
                      삭제
                    </button>
                  </div>
                )}
                <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                  <label className='col-span-2 space-y-1 text-sm font-medium text-slate-700'>
                    날짜
                    <input
                      aria-describedby={fieldErrors.windowErrors[index] ? `condition-window-error-${index}` : undefined}
                      aria-invalid={fieldErrors.windowErrors[index]?.field === 'date'}
                      className='mp-input aria-invalid:border-rose-600'
                      disabled={isSubmitting}
                      onChange={(event) => updateWindow(index, { date: event.target.value })}
                      type='date'
                      value={window.date}
                    />
                  </label>
                  <label className='min-w-0 space-y-1 text-sm font-medium text-slate-700'>
                    시작
                    <input
                      aria-describedby={fieldErrors.windowErrors[index] ? `condition-window-error-${index}` : undefined}
                      aria-invalid={fieldErrors.windowErrors[index]?.field === 'startsAt'}
                      className='mp-input aria-invalid:border-rose-600'
                      disabled={isSubmitting}
                      onChange={(event) => updateWindow(index, { startsAt: event.target.value })}
                      type='time'
                      value={window.startsAt}
                    />
                  </label>
                  <label className='min-w-0 space-y-1 text-sm font-medium text-slate-700'>
                    종료
                    <input
                      aria-describedby={fieldErrors.windowErrors[index] ? `condition-window-error-${index}` : undefined}
                      aria-invalid={fieldErrors.windowErrors[index]?.field === 'endsAt'}
                      className='mp-input aria-invalid:border-rose-600'
                      disabled={isSubmitting}
                      onChange={(event) => updateWindow(index, { endsAt: event.target.value })}
                      type='time'
                      value={window.endsAt}
                    />
                  </label>
                </div>
                {fieldErrors.windowErrors[index] && (
                  <p
                    className='mt-2 text-xs leading-5 text-rose-600'
                    id={`condition-window-error-${index}`}
                  >
                    {fieldErrors.windowErrors[index]?.message}
                  </p>
                )}
              </div>
            ))}
            {fieldErrors.windows && (
              <p className='text-xs leading-5 text-rose-600'>{fieldErrors.windows}</p>
            )}
            <button
              className='min-h-11 rounded-lg text-sm font-semibold text-[var(--mp-purple)] underline-offset-4 hover:underline disabled:opacity-50'
              disabled={windows.length >= 10 || isSubmitting}
              onClick={() => setWindows((current) => [...current, emptyWindow()])}
              type='button'
            >
              + 시간 추가
            </button>
          </fieldset>

          <details className='border-t border-[var(--mp-line)] pt-2' ref={extraConditionsRef}>
            <summary className='cursor-pointer py-2 text-sm font-semibold'>예산·장소 특징 (선택)</summary>
            <div className='mt-2 grid gap-4 md:grid-cols-2'>
              <fieldset className='space-y-2'>
                <legend className='mb-1 text-sm font-semibold'>예산</legend>
                <label className='flex items-center gap-2 text-sm text-slate-700'>
                  <input
                    checked={noBudgetLimit}
                    className='accent-[var(--mp-purple)]'
                    disabled={isSubmitting}
                    onChange={(event) => setNoBudgetLimit(event.target.checked)}
                    type='checkbox'
                  />
                  예산 제한 없음
                </label>
                {!noBudgetLimit && (
                  <div>
                    <label className='block space-y-1 text-sm font-medium text-slate-700'>
                      1인 최대 예산 (원)
                      <input
                        aria-describedby={fieldErrors.budget ? 'condition-budget-error' : undefined}
                        aria-invalid={Boolean(fieldErrors.budget)}
                        className='mp-input aria-invalid:border-rose-600'
                        disabled={isSubmitting}
                        inputMode='numeric'
                        min='0'
                        onChange={(event) => {
                          setBudget(event.target.value);
                          setFieldErrors((current) => ({ ...current, budget: undefined }));
                        }}
                        placeholder='예: 30000'
                        type='number'
                        value={budget}
                      />
                    </label>
                    {fieldErrors.budget && (
                      <p className='mt-2 text-xs leading-5 text-rose-600' id='condition-budget-error'>
                        {fieldErrors.budget}
                      </p>
                    )}
                  </div>
                )}
              </fieldset>

              <fieldset className='space-y-3'>
                <legend className='mb-1 text-sm font-semibold'>장소 특징 <span className='font-normal text-[var(--mp-muted)]'>쉼표로 구분</span></legend>
                <label className='block space-y-1 text-sm font-medium text-slate-700'>
                  꼭 필요한 특징
                  <input
                    aria-describedby={fieldErrors.preferences ? 'condition-preferences-error' : undefined}
                    aria-invalid={Boolean(fieldErrors.preferences)}
                    className='mp-input aria-invalid:border-rose-600'
                    disabled={isSubmitting}
                    onChange={(event) => setRequiredTags(event.target.value)}
                    placeholder='예: 실내, 조용한 곳'
                    value={requiredTags}
                  />
                </label>
                <label className='block space-y-1 text-sm font-medium text-slate-700'>
                  있으면 좋은 특징
                  <input
                    aria-describedby={fieldErrors.preferences ? 'condition-preferences-error' : undefined}
                    className='mp-input'
                    disabled={isSubmitting}
                    onChange={(event) => setPreferredTags(event.target.value)}
                    placeholder='예: 카페, 주차 가능'
                    value={preferredTags}
                  />
                </label>
                <label className='block space-y-1 text-sm font-medium text-slate-700'>
                  피하고 싶은 특징
                  <input
                    aria-describedby={fieldErrors.preferences ? 'condition-preferences-error' : undefined}
                    className='mp-input'
                    disabled={isSubmitting}
                    onChange={(event) => setAvoidTags(event.target.value)}
                    placeholder='예: 흡연, 계단'
                    value={avoidTags}
                  />
                </label>
                {fieldErrors.preferences && (
                  <p className='text-xs leading-5 text-rose-600' id='condition-preferences-error'>{fieldErrors.preferences}</p>
                )}
              </fieldset>
            </div>
          </details>

          {formMessage && (
            <p aria-live='polite' className='text-sm leading-5 text-[var(--mp-muted)]'>
              {formMessage}
            </p>
          )}
          <button
            className='mp-button mp-button-accent min-h-11 w-full rounded-lg'
            disabled={isSubmitting}
            type='submit'
          >
            {isSubmitting
              ? '선택 조건 저장 중...'
              : condition
                ? '선택 조건 수정 저장'
                : '선택 조건 저장'}
          </button>
        </form>
      )}

    </section>
  );
}
