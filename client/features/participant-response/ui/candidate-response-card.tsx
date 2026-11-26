'use client';

import type { Candidate } from '@/entities/candidate';
import type { ParticipantCondition } from '@/entities/participant-condition';
import { useRef } from 'react';
import {
  availabilityOptions,
  formatCandidateTime,
  getAutoFillDescription,
  getConditionWarnings,
  getResponseState,
  getTimeMatch,
  messageClassName,
  responseStateLabel,
  timeMatchDescription,
  travelOptions,
  type ResponseForm,
  type ResponseSaveOverrides,
} from '@/features/participant-response/model/response-form';

type CandidateResponseCardProps = {
  candidate: Candidate;
  condition: ParticipantCondition | null | undefined;
  form: ResponseForm;
  isReadOnly: boolean;
  isBulkSubmitting: boolean;
  onUpdate: (update: Partial<ResponseForm>) => void;
  onSave: (overrides?: ResponseSaveOverrides) => void;
};

export function CandidateResponseCard({
  candidate,
  condition,
  form,
  isReadOnly,
  isBulkSubmitting,
  onUpdate,
  onSave,
}: CandidateResponseCardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const responseState = getResponseState(form);
  const conditionWarnings = getConditionWarnings(candidate, condition);
  const autoFillDescription = getAutoFillDescription(
    form,
    candidate,
    condition
  );
  const isDisabled = isReadOnly || form.isSubmitting || isBulkSubmitting;
  const showTravel = Boolean(form.availabilityStatus || form.travelBurden || isReadOnly);
  const [featuredTag, ...otherTags] = candidate.tags;
  const cardHighlight = featuredTag || (candidate.place.area !== candidate.place.address ? candidate.place.area : '');

  function updateResponse(update: ResponseSaveOverrides) {
    onUpdate({ ...update, message: '', messageKind: null });
  }

  return (
    <article className='mp-card mp-candidate flex min-w-0 flex-col gap-2.5 p-3.5 sm:p-4'>
      <div className='space-y-1'>
        <div className='flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1'>
          <h3 className='min-w-0 text-xl font-extrabold tracking-tight [overflow-wrap:anywhere]'>
            {candidate.place.name}
          </h3>
          {cardHighlight && <p className='mp-candidate-tag'>{cardHighlight}</p>}
        </div>
        <p className='text-sm font-medium text-[var(--mp-muted)] [overflow-wrap:anywhere]'>{formatCandidateTime(candidate)}</p>
        <p className='text-sm text-[var(--mp-muted)] [overflow-wrap:anywhere]'>
          {candidate.place.address} · 1인 {candidate.estimatedCostPerPersonKrw.toLocaleString('ko-KR')}원
        </p>
      </div>
      {form.reconfirmRequired && (
        <p role='status' className='text-sm leading-6 text-slate-700'>
          후보가 변경되어 의견 재확인이 필요합니다. 이전 의견은 초안으로 남아 있습니다.
          현재 시간·장소·비용·특징을 확인하고 다시 저장해 주세요.
        </p>
      )}
      {otherTags.length > 0 && (
        <div className='flex min-w-0 flex-wrap gap-x-2 gap-y-1'>
          {otherTags.map((tag) => (
            <span
              className='text-xs text-[var(--mp-muted)] [overflow-wrap:anywhere]'
              key={tag}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
      <div className='mt-auto space-y-2'>
        <p className={`text-sm font-semibold ${responseState === 'saved' ? 'text-[#315d44]' : 'text-[var(--mp-muted)]'}`}>
          {responseState === 'dirty' && !form.savedResponseId
            ? form.autoFill && !form.manuallyEdited
              ? '자동으로 채움 · 저장 전'
              : '작성 중 · 저장 전'
            : responseStateLabel(responseState)}
        </p>
        <button
          className={`mp-button min-h-11 w-full ${isReadOnly || responseState === 'saved' ? 'mp-button-secondary' : 'mp-button-primary'}`}
          onClick={() => {
            const dialog = dialogRef.current;
            dialog?.showModal();
            dialog?.querySelector<HTMLButtonElement>('fieldset button:enabled')?.focus();
          }}
          type='button'
        >
          {isReadOnly ? '내 의견 보기' : form.savedResponseId ? '의견 확인하기' : '의견 남기기'}
        </button>
      </div>
      <dialog aria-label={`${candidate.place.name} 의견`} className='mp-dialog' ref={dialogRef}>
      <div className='space-y-3 p-4 sm:p-6'>
        <div className='flex items-start justify-between gap-3'>
          <h3 className='min-w-0 text-xl font-extrabold tracking-tight [overflow-wrap:anywhere]'>{candidate.place.name}에 대한 내 의견</h3>
          <button aria-label='의견 창 닫기' className='mp-button mp-button-secondary min-h-11 min-w-11 shrink-0 p-0 text-xl' onClick={() => dialogRef.current?.close()} type='button'>×</button>
        </div>
        <fieldset className='space-y-2'>
          <legend className='text-sm font-semibold text-slate-800'>
            이 시간에 갈 수 있나요?
          </legend>
          <div className='grid grid-cols-3 gap-2'>
            {availabilityOptions.map((option) => (
              <button
                aria-pressed={form.availabilityStatus === option.value}
                className='mp-button mp-button-secondary min-h-12 px-1 text-xs break-keep aria-pressed:border-[var(--mp-purple)] aria-pressed:bg-[var(--mp-lilac)] aria-pressed:text-[var(--mp-purple-hover)] sm:text-sm'
                disabled={isDisabled}
                key={option.value}
                onClick={() =>
                  updateResponse({ availabilityStatus: option.value })
                }
                type='button'
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        {autoFillDescription && (
          <p className='text-sm leading-5 text-slate-700'>
            {autoFillDescription} 아직 저장하지 않은 초안입니다.
          </p>
        )}

        {showTravel && <fieldset className='space-y-2'>
          <legend className='text-sm font-semibold text-slate-800'>
            여기까지 오는 길은 어때요?
          </legend>
          <div className='grid grid-cols-3 gap-2'>
            {travelOptions.map((option) => (
              <button
                aria-pressed={form.travelBurden === option.value}
                className='mp-button mp-button-secondary min-h-12 px-1 text-xs break-keep aria-pressed:border-[var(--mp-purple)] aria-pressed:bg-[var(--mp-lilac)] aria-pressed:text-[var(--mp-purple-hover)] sm:text-sm'
                disabled={isDisabled}
                key={option.value}
                onClick={() => updateResponse({ travelBurden: option.value })}
                type='button'
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>}

        {condition && (
          <div
            aria-live='polite'
            className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-5 text-slate-700'
          >
            <p className='font-semibold'>저장된 선택 조건과 비교</p>
            <p className='mt-1'>
              {timeMatchDescription(getTimeMatch(candidate, condition))}
            </p>
            <ul className='mt-1 list-disc space-y-0.5 pl-5'>
              {conditionWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            <p className='mt-1 text-xs'>
              시간·예산·특징에 대한 안내입니다. 이동 부담과 실제 참석 가능
              여부를 확인해 주세요. 충돌이 있어도 직접 선택한 의견은 저장할 수
              있습니다.
            </p>
          </div>
        )}

        <details className='text-sm text-slate-700'>
          <summary className='cursor-pointer py-1 font-semibold'>{form.note ? '메모 보기' : '메모 추가'} (선택)</summary>
          <textarea
            aria-label='메모 (선택)'
            className='mp-input mt-2 min-h-16 resize-y disabled:bg-slate-50'
            disabled={isDisabled}
            maxLength={300}
            onChange={(event) => updateResponse({ note: event.target.value })}
            value={form.note}
          />
        </details>

        {form.message && form.messageKind && (
          <p
            aria-live='polite'
            className={`text-sm leading-6 ${messageClassName(form.messageKind)}`}
          >
            {form.message}
          </p>
        )}

        {!isReadOnly && !form.isSubmitting && form.manuallyEdited && responseState === 'dirty' && (
          <p className='text-sm text-[var(--mp-muted)]'>닫아도 이 후보의 입력은 초안으로 남아요.</p>
        )}

        {showTravel && responseState !== 'saved' && !isReadOnly && <button
          className={`mp-button min-h-11 w-full ${form.availabilityStatus && form.travelBurden ? 'mp-button-primary' : 'mp-button-secondary'}`}
          disabled={isDisabled}
          onClick={() => onSave()}
          type='button'
        >
          {form.isSubmitting
            ? '저장 중...'
            : isBulkSubmitting
              ? '전체 저장 중...'
              : '이 후보 의견 저장'}
        </button>}
      </div>
      </dialog>
    </article>
  );
}
