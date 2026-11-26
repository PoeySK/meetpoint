'use client';

import {
  archiveCandidate,
  createCandidate,
  updateCandidate,
} from '@/entities/candidate';
import type {
  Candidate,
  CreateCandidateInput,
  UpdateCandidateInput,
} from '@/entities/candidate';
import type { RoomDetailsResponse } from '@/entities/room';
import {
  buildKstDateTime,
  getDateTimeInputValues,
  getKstDateValue,
  parseDateValue,
} from '@/features/candidate-management/ui/candidate-date-picker';
import {
  CandidateForm,
  type CandidateFieldErrors,
} from '@/features/candidate-management/ui/candidate-form';
import { RoomApiError } from '@/shared/api/http-client';
import { getRoomAccessErrorMessage } from '@/shared/lib/room-access-error';
import { MEETPOINT_TIMEZONE } from '@/shared/config/meetpoint';
import { useRef, useState, type FormEvent } from 'react';

type CandidateManagementPanelProps = {
  roomId: string;
  token: string;
  participantId: string;
  room: RoomDetailsResponse;
  onRoomRefresh: () => Promise<void>;
};

function getCandidateFormValues(candidate: Candidate) {
  const startsAt = getDateTimeInputValues(
    candidate.time.startsAt,
    candidate.time.timezone,
  );
  const endsAt = getDateTimeInputValues(
    candidate.time.endsAt,
    candidate.time.timezone,
  );

  return {
    address: candidate.place.address,
    area: candidate.place.area === candidate.place.address ? '' : candidate.place.area,
    cost: String(candidate.estimatedCostPerPersonKrw),
    date: startsAt.date,
    endTime: endsAt.time,
    placeName: candidate.place.name,
    startTime: startsAt.time,
    tags: candidate.tags.join(', '),
  };
}

function formatCandidateTimeRange({ startsAt, endsAt, timezone }: Candidate['time']) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).formatRange(new Date(startsAt), new Date(endsAt));
}

function parseTimeValue(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function validateCandidateForm(
  date: string,
  startTime: string,
  endTime: string,
  placeName: string,
  address: string,
  cost: string,
  tags: string
) {
  const errors: CandidateFieldErrors = {};
  const parsedStartTime = parseTimeValue(startTime);
  const parsedEndTime = parseTimeValue(endTime);
  const parsedCost = Number(cost);

  if (!parseDateValue(date)) {
    errors.date = '모임 날짜를 선택해 주세요.';
  }

  if (parsedStartTime === null || parsedEndTime === null) {
    errors.time = '시작 시간과 종료 시간을 입력해 주세요.';
  } else if (parsedEndTime <= parsedStartTime) {
    errors.time = '종료 시간은 시작 시간보다 늦어야 합니다.';
  }

  if (
    !placeName.trim() ||
    placeName.trim().length > 120 ||
    !address.trim() ||
    address.trim().length > 120
  ) {
    errors.place = '장소명과 주소를 1~120자로 입력해 주세요.';
  }

  if (
    !cost.trim() ||
    !Number.isInteger(parsedCost) ||
    parsedCost < 0 ||
    parsedCost > 2_000_000
  ) {
    errors.cost = '1인 예상 비용은 0~2,000,000원 정수로 입력해 주세요.';
  }

  const normalizedTags = tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (normalizedTags.length > 10) {
      errors.tags = '특징은 최대 10개까지 입력할 수 있습니다.';
  }

  return errors;
}

function describeCandidateError(error: unknown) {
  if (error instanceof RoomApiError && error.status === 429) return error.message;
  if (error instanceof RoomApiError) {
    if (error.code === 'CANDIDATE_LIMIT_EXCEEDED') {
      return '후보는 최대 5개까지 등록할 수 있습니다. 다른 후보를 제외한 뒤 추가해 주세요.';
    }
    if (error.code === 'HOST_ONLY') {
      return '방장만 후보를 등록할 수 있습니다.';
    }
    if (error.code === 'ROOM_STATE_CONFLICT') {
      return '현재 방 상태에서는 후보를 바꿀 수 없습니다.';
    }
    if (error.code === 'CANDIDATE_VERSION_CONFLICT') {
      return '다른 사람이 후보를 먼저 변경했습니다. 최신 정보를 확인한 뒤 다시 저장해 주세요.';
    }
    if (error.code === 'VALIDATION_ERROR') {
      return '후보 입력을 다시 확인해 주세요.';
    }
    if (error.code === 'NETWORK_ERROR') {
      return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
    }
    const accessMessage = getRoomAccessErrorMessage(error);
    if (accessMessage) return accessMessage;
  }

  return '후보를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

export function CandidateManagementPanel({
  roomId,
  token,
  participantId,
  room,
  onRoomRefresh,
}: CandidateManagementPanelProps) {
  const isHost = participantId === room.room.hostParticipantId;
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [address, setAddress] = useState('');
  const [area, setArea] = useState('');
  const [cost, setCost] = useState('');
  const [tags, setTags] = useState('');
  const [fieldErrors, setFieldErrors] = useState<CandidateFieldErrors>({});
  const [formError, setFormError] = useState('');
  const [panelError, setPanelError] = useState('');
  const [formNotice, setFormNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddingCandidate, setIsAddingCandidate] = useState(false);
  const composerRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const composerTriggerRef = useRef<HTMLButtonElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(
    null,
  );
  const [archiveCandidateId, setArchiveCandidateId] = useState<string | null>(
    null,
  );
  const [isArchiving, setIsArchiving] = useState(false);

  const editingCandidate = editingCandidateId
    ? room.candidates.find((candidate) => candidate.id === editingCandidateId) ??
      null
    : null;

  if (!isHost) {
    return null;
  }

  const isCandidateMutationDisabled =
    room.room.status === 'CALCULATING' ||
    room.room.status === 'CONFIRMED' ||
    room.room.status === 'CLOSED';
  const hasReachedCandidateLimit = room.candidates.length >= 5;
  const showComposer = room.candidates.length === 0 || isAddingCandidate || Boolean(editingCandidateId);
  const candidateNumber = editingCandidate?.displayOrder ??
    room.candidates.length + 1;

  function clearCandidateForm() {
    setDate('');
    setStartTime('');
    setEndTime('');
    setPlaceName('');
    setAddress('');
    setArea('');
    setCost('');
    setTags('');
    setFieldErrors({});
    setFormError('');
    setPanelError('');
    setFormNotice('');
  }

  function fillExample() {
    setDate(getKstDateValue(1));
    setStartTime('19:00');
    setEndTime('21:00');
    setPlaceName('강남역 조용한 식당');
    setAddress('서울 강남구 테헤란로 1');
    setArea('강남');
    setCost('28000');
    setTags('조용함, 야외');
    setFieldErrors({});
    setFormError('');
    setPanelError('');
    setFormNotice('');
  }

  function populateCandidateForm(values: ReturnType<typeof getCandidateFormValues>) {
    setDate(values.date);
    setStartTime(values.startTime);
    setEndTime(values.endTime);
    setPlaceName(values.placeName);
    setAddress(values.address);
    setArea(values.area);
    setCost(values.cost);
    setTags(values.tags);
    setFieldErrors({});
    setFormError('');
    setPanelError('');
    setFormNotice('');
  }

  function addAnotherTime(candidate: Candidate, trigger: HTMLButtonElement) {
    setEditingCandidateId(null);
    populateCandidateForm({ ...getCandidateFormValues(candidate), startTime: '', endTime: '' });
    openComposer(trigger, 'input[type="time"]');
  }

  function openComposer(trigger: HTMLButtonElement, fieldSelector = 'input') {
    composerTriggerRef.current = trigger;
    setIsAddingCandidate(true);
    window.requestAnimationFrame(() => {
      composerRef.current?.querySelector<HTMLInputElement>(fieldSelector)?.focus();
    });
  }

  function applyTimePreset(start: string, end: string) {
    setStartTime(start);
    setEndTime(end);
    setFieldErrors((current) => ({ ...current, time: undefined }));
  }

  function applyDate(value: string) {
    setDate(value);
    setFieldErrors((current) => ({ ...current, date: undefined }));
  }

  function applyTimeChange(setter: (value: string) => void, value: string) {
    setter(value);
    setFieldErrors((current) => ({ ...current, time: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingCandidateId && !editingCandidate) {
      setFormError('이 후보가 목록에서 제외되었습니다. 수정 취소를 눌러 주세요.');
      return;
    }
    const errors = validateCandidateForm(
      date,
      startTime,
      endTime,
      placeName,
      address,
      cost,
      tags
    );
    setFieldErrors(errors);
    setFormError('');

    if (Object.keys(errors).length > 0) {
      const form = event.currentTarget;
      window.requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]')?.focus());
      return;
    }

    const normalizedTags = tags
      .split(',')
      .map((tag) => tag.trim().toUpperCase())
      .filter(Boolean);
    const normalizedName = placeName.trim();
    const normalizedAddress = address.trim();
    const knownArea = room.candidates.find(
      (candidate) => candidate.id !== editingCandidateId &&
        candidate.place.name === normalizedName && candidate.place.address === normalizedAddress
    )?.place.area;
    const input: CreateCandidateInput = {
      displayOrder: editingCandidate?.displayOrder ?? candidateNumber,
      time: {
        startsAt: buildKstDateTime(date, startTime),
        endsAt: buildKstDateTime(date, endTime),
        timezone: MEETPOINT_TIMEZONE,
      },
      place: {
        name: normalizedName,
        address: normalizedAddress,
        area: area.trim() || knownArea || normalizedAddress,
      },
      estimatedCostPerPersonKrw: Number(cost),
      tags: normalizedTags,
    };

    setIsSubmitting(true);
    try {
      if (editingCandidate) {
        const updateInput: UpdateCandidateInput = input;
        await updateCandidate(
          roomId,
          editingCandidate.id,
          token,
          editingCandidate.version,
          updateInput,
        );
        setEditingCandidateId(null);
        clearCandidateForm();
        setFormNotice(
          '후보를 수정했습니다. 기존 추천 결과가 있다면 최신 내용으로 다시 만들어 주세요.',
        );
      } else {
        await createCandidate(roomId, token, input);
        clearCandidateForm();
        setFormNotice('후보를 올렸어요. 다른 시간이나 장소도 후보로 올릴 수 있어요.');
      }
      setIsAddingCandidate(false);
      await onRoomRefresh();
      window.requestAnimationFrame(() => headingRef.current?.focus());
    } catch (error) {
      setFormError(describeCandidateError(error));
      if (
        error instanceof RoomApiError &&
        error.code === 'CANDIDATE_VERSION_CONFLICT'
      ) {
        await onRoomRefresh();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEditing(candidate: Candidate, trigger: HTMLButtonElement) {
    setArchiveCandidateId(null);
    setEditingCandidateId(candidate.id);
    populateCandidateForm(getCandidateFormValues(candidate));
    openComposer(trigger);
  }

  function closeComposer() {
    const trigger = composerTriggerRef.current;
    setEditingCandidateId(null);
    setIsAddingCandidate(false);
    clearCandidateForm();
    window.requestAnimationFrame(() => {
      (trigger?.isConnected ? trigger : addButtonRef.current ?? headingRef.current)?.focus();
    });
  }

  async function handleArchive(candidate: Candidate) {
    if (isArchiving || isCandidateMutationDisabled) {
      return;
    }

    setIsArchiving(true);
    setFormError('');
    setPanelError('');
    setFormNotice('');
    try {
      await archiveCandidate(roomId, candidate.id, token, candidate.version);
      if (editingCandidateId === candidate.id) {
        setEditingCandidateId(null);
        clearCandidateForm();
      }
      setArchiveCandidateId(null);
      setFormNotice(
        '후보를 새 추천에서 제외했습니다. 기존 추천 결과의 기록은 그대로 남아 있습니다.',
      );
      await onRoomRefresh();
    } catch (error) {
      setPanelError(describeCandidateError(error));
      if (
        error instanceof RoomApiError &&
        error.code === 'CANDIDATE_VERSION_CONFLICT'
      ) {
        await onRoomRefresh();
      }
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <section className='space-y-4 p-4 sm:p-6'>
      <div className='flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1'>
        <div className='space-y-1.5'>
          <h2 className='scroll-mt-4 text-xl font-semibold tracking-tight text-slate-950' ref={headingRef} tabIndex={-1}>
            모임 후보 관리
          </h2>
        </div>
        <div className='flex items-center gap-3'>
          <span className='text-xs font-semibold text-slate-600'>후보 {room.candidates.length}/5</span>
          {!showComposer && !hasReachedCandidateLimit && !isCandidateMutationDisabled && (
            <button className='mp-button mp-button-accent min-h-11 rounded-lg' onClick={(event) => openComposer(event.currentTarget)} ref={addButtonRef} type='button'>
              후보 추가
            </button>
          )}
        </div>
      </div>

      {formNotice && (
        <p
          aria-live='polite'
          className='mb-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm leading-5 text-slate-700'
        >
          {formNotice}
        </p>
      )}
      {panelError && (
        <p
          aria-live='polite'
          className='mb-4 rounded-xl bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-700'
        >
          {panelError}
        </p>
      )}

      {isCandidateMutationDisabled ? (
        <p className='rounded-xl bg-white px-3 py-2.5 text-sm leading-5 text-slate-600'>
          {room.room.status === 'CALCULATING'
            ? '추천 결과를 준비 중이라 후보를 바꿀 수 없습니다.'
            : '일정이 확정되었거나 종료된 방에서는 후보를 변경할 수 없습니다.'}
        </p>
      ) : hasReachedCandidateLimit && !editingCandidateId ? (
        <p className='rounded-xl bg-white px-3 py-2.5 text-sm leading-5 text-slate-600'>
          후보 5개가 이미 등록되어 더 추가할 수 없습니다. 기존 후보를 제외하면 새 후보를 등록할 수 있습니다.
        </p>
      ) : showComposer && (
        <section aria-label={editingCandidateId ? '후보 수정' : '후보 올리기'} className='scroll-mt-4' ref={composerRef} tabIndex={-1}>
          <CandidateForm
            address={address}
            area={area}
            cost={cost}
            date={date}
            endTime={endTime}
            fieldErrors={fieldErrors}
            formError={formError}
            isSubmitting={isSubmitting}
            mode={editingCandidateId ? 'edit' : 'create'}
            nextCandidateNumber={candidateNumber}
            onAddressChange={setAddress}
            onAreaChange={setArea}
            onCancel={editingCandidateId || room.candidates.length > 0 ? closeComposer : undefined}
            onClear={clearCandidateForm}
            onCostChange={setCost}
            onDateChange={applyDate}
            onEndTimeChange={(value) => applyTimeChange(setEndTime, value)}
            onFillExample={fillExample}
            onPlaceNameChange={setPlaceName}
            onStartTimeChange={(value) => applyTimeChange(setStartTime, value)}
            onSubmit={handleSubmit}
            onTagsChange={setTags}
            onTimePreset={applyTimePreset}
            placeName={placeName}
            startTime={startTime}
            tags={tags}
          />
        </section>
      )}

      <div className='space-y-2 empty:hidden'>
        {room.candidates.map((candidate) => (
            <article
              className='rounded-xl border border-stone-200 bg-stone-50 p-3.5 sm:p-4'
              key={candidate.id}
            >
              <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
                <div className='min-w-0 space-y-1'>
                  <p className='text-xs font-semibold text-slate-700'>
                    {formatCandidateTimeRange(candidate.time)}
                  </p>
                  <h3 className='text-base font-semibold text-slate-950'>
                    {candidate.place.name}
                  </h3>
                  <p className='text-sm leading-5 text-slate-600'>
                    {candidate.place.address} · 1인 {candidate.estimatedCostPerPersonKrw.toLocaleString('ko-KR')}원
                  </p>
                  {candidate.tags.length > 0 && (
                    <div className='flex flex-wrap gap-1.5 pt-1'>
                      {candidate.tags.map((tag) => (
                        <span
                          className='rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700'
                          key={tag}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className='flex shrink-0 flex-wrap gap-2'>
                  {!hasReachedCandidateLimit && !isCandidateMutationDisabled && (
                    <button
                      className='mp-button mp-button-secondary px-3 py-1.5 text-xs'
                      disabled={isSubmitting || isArchiving}
                      onClick={(event) => addAnotherTime(candidate, event.currentTarget)}
                      type='button'
                    >
                      다른 시간 추가
                    </button>
                  )}
                  <button
                    className='mp-button mp-button-secondary px-3 py-1.5 text-xs'
                    disabled={isCandidateMutationDisabled || isSubmitting || isArchiving}
                    onClick={(event) => startEditing(candidate, event.currentTarget)}
                    type='button'
                  >
                    수정
                  </button>
                  <button
                    className='mp-button mp-button-secondary border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:border-rose-300 hover:bg-rose-50'
                    disabled={isCandidateMutationDisabled || isSubmitting || isArchiving}
                    onClick={() => {
                      setArchiveCandidateId(candidate.id);
                      setFormError('');
                      setFormNotice('');
                    }}
                    type='button'
                  >
                    새 추천에서 제외
                  </button>
                </div>
              </div>

              {archiveCandidateId === candidate.id && (
                <div className='mt-3 rounded-xl border border-rose-100 bg-rose-50/80 p-3'>
                  <p className='text-sm leading-5 text-rose-800'>
                    이 후보를 새 추천과 의견 대상에서 제외합니다. 기존 추천 결과에는
                    기록이 남습니다. 제외할까요?
                  </p>
                  <div className='mt-3 flex flex-wrap gap-2'>
                    <button
                      className='mp-button bg-rose-700 px-3 py-1.5 text-xs text-white hover:bg-rose-800'
                      disabled={isArchiving}
                      onClick={() => void handleArchive(candidate)}
                      type='button'
                    >
                      {isArchiving ? '처리 중...' : '후보 제외 확인'}
                    </button>
                    <button
                      className='mp-button mp-button-secondary px-3 py-1.5 text-xs'
                      disabled={isArchiving}
                      onClick={() => setArchiveCandidateId(null)}
                      type='button'
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
      </div>
    </section>
  );
}
