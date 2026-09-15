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
import { MEETPOINT_TIMEZONE } from '@/shared/config/meetpoint';
import { useEffect, useRef, useState, type FormEvent } from 'react';

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
    area: candidate.place.area,
    cost: String(candidate.estimatedCostPerPersonKrw),
    date: startsAt.date,
    endTime: endsAt.time,
    placeName: candidate.place.name,
    startTime: startsAt.time,
    tags: candidate.tags.join(', '),
  };
}

function formatCandidateDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
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
  area: string,
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
    address.trim().length > 120 ||
    !area.trim()
  ) {
    errors.place = '장소명·주소는 1~120자, 지역은 필수입니다.';
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
  if (error instanceof RoomApiError) {
    if (error.code === 'CANDIDATE_LIMIT_EXCEEDED') {
      return '후보는 최대 5개까지 등록할 수 있습니다.';
    }
    if (error.code === 'HOST_ONLY') {
      return '방장만 후보를 등록할 수 있습니다.';
    }
    if (error.code === 'ROOM_STATE_CONFLICT') {
      return '지금은 후보를 바꿀 수 없습니다.';
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
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(
    null,
  );
  const [archiveCandidateId, setArchiveCandidateId] = useState<string | null>(
    null,
  );
  const [isArchiving, setIsArchiving] = useState(false);
  const hydratedEditingCandidateRef = useRef<string | null>(null);

  const editingCandidate = editingCandidateId
    ? room.candidates.find((candidate) => candidate.id === editingCandidateId) ??
      null
    : null;

  useEffect(() => {
    if (!editingCandidateId) {
      hydratedEditingCandidateRef.current = null;
      return;
    }
    if (hydratedEditingCandidateRef.current === editingCandidateId) {
      return;
    }

    const candidate = room.candidates.find(
      (item) => item.id === editingCandidateId,
    );
    if (!candidate) {
      const timerId = window.setTimeout(() => {
        setEditingCandidateId(null);
      }, 0);
      return () => window.clearTimeout(timerId);
    }

    const values = getCandidateFormValues(candidate);
    const timerId = window.setTimeout(() => {
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
      setFormNotice('');
      hydratedEditingCandidateRef.current = editingCandidateId;
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [editingCandidateId, room.candidates]);

  if (!isHost) {
    return null;
  }

  const isCandidateMutationDisabled =
    room.room.status === 'CALCULATING' ||
    room.room.status === 'CONFIRMED' ||
    room.room.status === 'CLOSED';
  const hasReachedCandidateLimit = room.candidates.length >= 5;
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
    const errors = validateCandidateForm(
      date,
      startTime,
      endTime,
      placeName,
      address,
      area,
      cost,
      tags
    );
    setFieldErrors(errors);
    setFormError('');

    if (Object.keys(errors).length > 0) {
      return;
    }

    const normalizedTags = tags
      .split(',')
      .map((tag) => tag.trim().toUpperCase())
      .filter(Boolean);
    const input: CreateCandidateInput = {
      displayOrder: editingCandidate?.displayOrder ?? candidateNumber,
      time: {
        startsAt: buildKstDateTime(date, startTime),
        endsAt: buildKstDateTime(date, endTime),
        timezone: MEETPOINT_TIMEZONE,
      },
      place: {
        name: placeName.trim(),
        address: address.trim(),
        area: area.trim(),
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
          '후보를 수정했습니다. 새 추천 결과가 있다면 다시 만들어 주세요.',
        );
      } else {
        await createCandidate(roomId, token, input);
        clearCandidateForm();
        setFormNotice('후보를 등록했습니다. 참여자들에게 의견을 남겨 달라고 알려주세요.');
      }
      await onRoomRefresh();
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

  function startEditing(candidate: Candidate) {
    setArchiveCandidateId(null);
    setEditingCandidateId(candidate.id);
    setFormError('');
    setPanelError('');
    setFormNotice('');
  }

  function cancelEditing() {
    setEditingCandidateId(null);
    clearCandidateForm();
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
        '후보를 목록에서 뺐습니다. 기존 추천 결과의 기록은 그대로 남아 있습니다.',
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
    <section className='mp-card border-emerald-100 bg-emerald-50/55 p-4 sm:p-6'>
      <div className='mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div className='space-y-1.5'>
          <p className='text-sm font-semibold text-emerald-700'>방장</p>
          <h2 className='text-xl font-semibold tracking-tight text-slate-950'>
            모임 후보 관리
          </h2>
          <p className='text-sm leading-6 text-slate-600'>
            참여자들이 비교할 시간과 장소를 최대 5개까지 등록할 수
            있습니다.
          </p>
        </div>
        <span className='w-fit rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600'>
          {room.candidates.length} / 5개
        </span>
      </div>

      <div className='mb-4 rounded-xl border border-emerald-100 bg-white/75 p-3'>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <p className='text-sm font-semibold text-slate-950'>빠른 입력</p>
            <p className='mt-1 text-xs leading-5 text-slate-500'>
              예시를 채워 입력 방법을 확인하거나 테스트용 시간을 준비할 수
              있습니다.
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <button
              className='mp-button rounded-lg bg-emerald-700 px-3 py-1.5 text-xs text-white hover:bg-emerald-800'
              onClick={fillExample}
              disabled={isCandidateMutationDisabled || isSubmitting}
              type='button'
            >
              예시로 채우기
            </button>
            <button
              className='mp-button mp-button-secondary rounded-lg px-3 py-1.5 text-xs'
              onClick={clearCandidateForm}
              disabled={isCandidateMutationDisabled || isSubmitting}
              type='button'
            >
              입력 지우기
            </button>
          </div>
        </div>
      </div>

      {formNotice && (
        <p
          aria-live='polite'
          className='mb-4 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm leading-5 text-emerald-800'
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

      <div className='mb-5 space-y-3'>
        {room.candidates.length === 0 ? (
          <div className='rounded-xl border border-dashed border-emerald-200 bg-white/65 p-4 text-sm leading-5 text-slate-500'>
            아직 후보가 없습니다. 아래 입력창에서 첫 후보를 등록해 주세요.
          </div>
        ) : (
          room.candidates.map((candidate) => (
            <article
              className='rounded-xl border border-white/80 bg-white/80 p-4'
              key={candidate.id}
            >
              <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
                <div className='min-w-0 space-y-1'>
                  <p className='text-xs font-semibold text-emerald-700'>
                    후보 {candidate.displayOrder}번
                  </p>
                  <h3 className='text-base font-semibold text-slate-950'>
                    {candidate.place.name}
                  </h3>
                  <p className='text-sm leading-5 text-slate-600'>
                    {formatCandidateDateTime(
                      candidate.time.startsAt,
                      candidate.time.timezone,
                    )}{' '}
                    ~ {formatCandidateDateTime(
                      candidate.time.endsAt,
                      candidate.time.timezone,
                    )}
                  </p>
                  <p className='text-sm leading-5 text-slate-500'>
                    {candidate.place.address} · 1인 {candidate.estimatedCostPerPersonKrw.toLocaleString()}원
                  </p>
                  {candidate.tags.length > 0 && (
                    <div className='flex flex-wrap gap-1.5 pt-1'>
                      {candidate.tags.map((tag) => (
                        <span
                          className='rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700'
                          key={tag}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className='flex shrink-0 flex-wrap gap-2'>
                  <button
                    className='mp-button mp-button-secondary px-3 py-1.5 text-xs'
                    disabled={isCandidateMutationDisabled || isSubmitting || isArchiving}
                    onClick={() => startEditing(candidate)}
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
                    목록에서 빼기
                  </button>
                </div>
              </div>

              {archiveCandidateId === candidate.id && (
                <div className='mt-3 rounded-xl border border-rose-100 bg-rose-50/80 p-3'>
                  <p className='text-sm leading-5 text-rose-800'>
                    이 후보를 새 추천과 의견 대상에서 뺍니다. 기존 추천 결과에는 기록이
                    남습니다. 뺄까요?
                  </p>
                  <div className='mt-3 flex flex-wrap gap-2'>
                    <button
                      className='mp-button bg-rose-700 px-3 py-1.5 text-xs text-white hover:bg-rose-800'
                      disabled={isArchiving}
                      onClick={() => void handleArchive(candidate)}
                      type='button'
                    >
                      {isArchiving ? '처리 중...' : '목록에서 빼기'}
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
          ))
        )}
      </div>

      {isCandidateMutationDisabled ? (
        <p className='rounded-xl bg-white px-3 py-2.5 text-sm leading-5 text-slate-600'>
          {room.room.status === 'CALCULATING'
            ? '추천 결과를 만드는 중이라 후보를 바꿀 수 없습니다.'
            : '확정되거나 종료된 방에서는 후보를 변경할 수 없습니다.'}
        </p>
      ) : hasReachedCandidateLimit && !editingCandidate ? (
        <p className='rounded-xl bg-white px-3 py-2.5 text-sm leading-5 text-slate-600'>
          후보 5개가 이미 등록되어 더 추가할 수 없습니다.
        </p>
      ) : (
        <CandidateForm
          address={address}
          area={area}
          cost={cost}
          date={date}
          endTime={endTime}
          fieldErrors={fieldErrors}
          formError={formError}
          isSubmitting={isSubmitting}
          mode={editingCandidate ? 'edit' : 'create'}
          nextCandidateNumber={candidateNumber}
          onAddressChange={setAddress}
          onAreaChange={setArea}
          onCancel={editingCandidate ? cancelEditing : undefined}
          onCostChange={setCost}
          onDateChange={applyDate}
          onEndTimeChange={(value) => applyTimeChange(setEndTime, value)}
          onPlaceNameChange={setPlaceName}
          onStartTimeChange={(value) => applyTimeChange(setStartTime, value)}
          onSubmit={handleSubmit}
          onTagsChange={setTags}
          onTimePreset={applyTimePreset}
          placeName={placeName}
          startTime={startTime}
          tags={tags}
        />
      )}
    </section>
  );
}
