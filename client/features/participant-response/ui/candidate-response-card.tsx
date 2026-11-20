'use client';

import type { Candidate } from '@/entities/candidate';
import type { ParticipantCondition } from '@/entities/participant-condition';
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
  const responseState = getResponseState(form);
  const conditionWarnings = getConditionWarnings(candidate, condition);
  const autoFillDescription = getAutoFillDescription(
    form,
    candidate,
    condition
  );
  const isDisabled = isReadOnly || form.isSubmitting || isBulkSubmitting;

  function updateResponse(update: ResponseSaveOverrides) {
    onUpdate({ ...update, message: '', messageKind: null });
  }

  return (
    <article
      className='rounded-xl border border-slate-200 p-3.5'
    >
      <div className='space-y-2'>
        <div className='flex items-start justify-between gap-3'>
          <h3 className='min-w-0 text-base font-bold text-slate-950 [overflow-wrap:anywhere]'>
            {candidate.place.name}
          </h3>
          <span
            className='shrink-0 text-xs font-semibold text-slate-600'
          >
            {responseState === 'dirty' && !form.savedResponseId
              ? form.autoFill && !form.manuallyEdited
                ? '자동 초안 · 미제출'
                : '편집 초안 · 미제출'
              : responseStateLabel(responseState)}
          </span>
        </div>
        <p className='text-sm text-slate-600'>
          {formatCandidateTime(candidate)}
        </p>
        {form.reconfirmRequired && (
          <p role='status' className='text-sm leading-6 text-amber-800'>
            후보가 변경되어 의견 재확인이 필요합니다. 이전 의견은 초안으로 남아 있습니다.
            현재 시간·장소·비용·특징을 확인하고 다시 저장해 주세요.
          </p>
        )}
        <p className='text-sm text-slate-600'>
          {candidate.place.address} · 1인 {candidate.estimatedCostPerPersonKrw.toLocaleString('ko-KR')}원
        </p>
        {candidate.tags.length > 0 && (
          <div className='flex flex-wrap gap-2 pt-1'>
            {candidate.tags.map((tag) => (
              <span
                className='text-xs text-emerald-700'
                key={tag}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className='mt-4 space-y-3 border-t border-slate-100 pt-4'>
        <fieldset className='space-y-2'>
          <legend className='text-sm font-semibold text-slate-800'>
            참석 가능 여부
          </legend>
          <div className='grid grid-cols-3 gap-2'>
            {availabilityOptions.map((option) => (
              <button
                aria-pressed={form.availabilityStatus === option.value}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                  form.availabilityStatus === option.value
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                }`}
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
          <p className='text-sm leading-5 text-sky-800'>
            {autoFillDescription} 아직 저장하지 않은 초안입니다.
          </p>
        )}

        <fieldset className='space-y-2'>
          <legend className='text-sm font-semibold text-slate-800'>
            이동 부담
          </legend>
          <div className='grid grid-cols-3 gap-2'>
            {travelOptions.map((option) => (
              <button
                aria-pressed={form.travelBurden === option.value}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                  form.travelBurden === option.value
                    ? 'border-slate-950 bg-slate-950 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
                }`}
                disabled={isDisabled}
                key={option.value}
                onClick={() => updateResponse({ travelBurden: option.value })}
                type='button'
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        {condition && (
          <div
            aria-live='polite'
            className='rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-800'
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

        {responseState !== 'saved' && !isReadOnly && <button
          className='mp-button mp-button-secondary px-3 py-1.5 text-xs'
          disabled={isDisabled}
          onClick={() => onSave()}
          type='button'
        >
          {form.isSubmitting
            ? '저장 중...'
            : isBulkSubmitting
              ? '전체 저장 중...'
              : responseState === 'dirty' || responseState === 'reconfirm'
                ? '변경 저장'
                : '의견 저장'}
        </button>}
      </div>
    </article>
  );
}
