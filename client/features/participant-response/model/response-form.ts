import type { Candidate } from '@/entities/candidate';
import type { ParticipantCondition } from '@/entities/participant-condition';
import type {
  AvailabilityStatus,
  ParticipantResponsePayload,
  TravelBurden,
} from '@/entities/participant-response';
import { MEETPOINT_TIMEZONE } from '@/shared/config/meetpoint';

export type ResponseMessageKind = 'success' | 'error' | 'info';

export type ResponseForm = {
  availabilityStatus: AvailabilityStatus | null;
  travelBurden: TravelBurden | null;
  note: string;
  savedResponseId: string | null;
  savedAvailabilityStatus: AvailabilityStatus | null;
  savedTravelBurden: TravelBurden | null;
  savedNote: string;
  message: string;
  messageKind: ResponseMessageKind | null;
  isSubmitting: boolean;
  manuallyEdited: boolean;
  autoFill: {
    reason: string;
    conditionKey: string;
    candidateTimeKey: string;
  } | null;
};

export type ResponseSaveOverrides = Partial<
  Pick<ResponseForm, 'availabilityStatus' | 'travelBurden' | 'note'>
>;

export type PanelMessage = {
  text: string;
  kind: ResponseMessageKind;
};

export const availabilityOptions: Array<{
  value: AvailabilityStatus;
  label: string;
}> = [
  { value: 'AVAILABLE', label: '가능' },
  { value: 'MAYBE', label: '아마 가능' },
  { value: 'UNAVAILABLE', label: '불가' },
];

export const travelOptions: Array<{ value: TravelBurden; label: string }> = [
  { value: 'EASY', label: '편함' },
  { value: 'NORMAL', label: '보통' },
  { value: 'HARD', label: '부담됨' },
];

export function createResponseForm(
  response?: ParticipantResponsePayload
): ResponseForm {
  const availabilityStatus = response?.availabilityStatus ?? 'MAYBE';
  const travelBurden = response?.travelBurden ?? null;
  const note = response?.note ?? '';

  return {
    availabilityStatus,
    travelBurden,
    note,
    savedResponseId: response?.id ?? null,
    savedAvailabilityStatus: availabilityStatus,
    savedTravelBurden: travelBurden,
    savedNote: note,
    message: '',
    messageKind: null,
    isSubmitting: false,
    manuallyEdited: false,
    autoFill: null,
  };
}

export function createInitialForms(
  candidates: Candidate[],
  responses: ParticipantResponsePayload[]
) {
  const responsesByCandidateId = new Map(
    responses.map((response) => [response.candidateId, response])
  );

  return candidates.reduce<Record<string, ResponseForm>>((forms, candidate) => {
    forms[candidate.id] = createResponseForm(
      responsesByCandidateId.get(candidate.id)
    );
    return forms;
  }, {});
}

export function isFormDirty(form: ResponseForm) {
  return (
    form.autoFill !== null ||
    (!form.savedResponseId && form.manuallyEdited) ||
    form.availabilityStatus !== form.savedAvailabilityStatus ||
    form.travelBurden !== form.savedTravelBurden ||
    form.note !== form.savedNote
  );
}

export function getResponseState(form: ResponseForm) {
  if (isFormDirty(form)) {
    return 'dirty' as const;
  }

  return form.savedResponseId ? ('saved' as const) : ('missing' as const);
}

export function getMissingFields(form: ResponseForm) {
  const missingFields: string[] = [];

  if (!form.availabilityStatus) {
    missingFields.push('참석 가능 여부');
  }
  if (!form.travelBurden) {
    missingFields.push('이동 부담');
  }

  return missingFields;
}

export function getMissingFieldsMessage(form: ResponseForm) {
  const missingFields = getMissingFields(form);

  if (missingFields.length === 0) {
    return '';
  }
  if (missingFields.length === 2) {
    return '참석 가능 여부와 이동 부담을 모두 선택해 주세요.';
  }

  return missingFields[0] === '참석 가능 여부'
    ? '참석 가능 여부를 선택해 주세요.'
    : '이동 부담을 선택해 주세요.';
}

export function getMissingFieldsDescription(form: ResponseForm) {
  const missingFields = getMissingFields(form);

  if (missingFields.length === 0) {
    return '';
  }
  if (missingFields.length === 2) {
    return '참석 가능 여부와 이동 부담을 모두 선택해야 합니다.';
  }

  return missingFields[0] === '참석 가능 여부'
    ? '참석 가능 여부를 선택해야 합니다.'
    : '이동 부담을 선택해야 합니다.';
}

export function getConditionWarnings(
  candidate: Candidate,
  condition: ParticipantCondition | null | undefined
) {
  if (!condition) {
    return [];
  }

  const warnings: string[] = [];

  if (
    !Number.isNaN(candidateStart) &&
    !Number.isNaN(candidateEnd) &&
    !condition.availabilityWindows.some((window) => {
      const windowStart = new Date(window.startsAt).getTime();
      const windowEnd = new Date(window.endsAt).getTime();
      return (
        !Number.isNaN(windowStart) &&
        !Number.isNaN(windowEnd) &&
        candidateStart >= windowStart &&
        candidateEnd <= windowEnd
      );
    })
  ) {
    warnings.push('선택 조건에 입력한 가능 시간과 다릅니다.');
  }

  if (
    condition.maxBudgetKrw !== null &&
    candidate.estimatedCostPerPersonKrw > condition.maxBudgetKrw
  ) {
    warnings.push(
      `1인 예상 비용이 선택한 예산 한도(${condition.maxBudgetKrw.toLocaleString('ko-KR')}원)를 넘습니다.`
    );
  }

  const candidateTags = new Set(
    candidate.tags.map((tag) => tag.trim().toUpperCase())
  );
  const missingRequiredTags = condition.preferences.requiredTags.filter(
    (tag) => !candidateTags.has(tag.trim().toUpperCase())
  );
  if (missingRequiredTags.length > 0) {
    warnings.push(
      `필수로 고른 특징이 없습니다: ${missingRequiredTags.join(', ')}`
    );
  }

  const presentAvoidTags = condition.preferences.avoidTags.filter((tag) =>
    candidateTags.has(tag.trim().toUpperCase())
  );
  if (presentAvoidTags.length > 0) {
    warnings.push(
      `피하고 싶은 특징이 포함되어 있습니다: ${presentAvoidTags.join(', ')}`
    );
  }

  return warnings;
}

// Reject timestamps without an explicit offset so browser timezone cannot affect the result.
function timestamp(value: string) {
  return /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? Date.parse(value) : NaN;
}

export function getTimeMatch(
  candidate: Candidate,
  condition: ParticipantCondition | null | undefined
): 'inside' | 'outside' | 'unknown' {
  const start = timestamp(candidate.time.startsAt);
  const end = timestamp(candidate.time.endsAt);
  if (
    !condition ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  ) {
    return 'unknown';
  }
  const windows = condition.availabilityWindows
    .map((window) => ({
      start: timestamp(window.startsAt),
      end: timestamp(window.endsAt),
    }))
    .filter(
      (window) =>
        Number.isFinite(window.start) &&
        Number.isFinite(window.end) &&
        window.end > window.start
    );
  if (windows.some((window) => start >= window.start && end <= window.end))
    return 'inside';
  return windows.length === 0 ? 'unknown' : 'outside';
}

export function timeMatchDescription(match: ReturnType<typeof getTimeMatch>) {
  if (match === 'inside') return '저장된 내 가능 시간 안입니다.';
  if (match === 'outside') return '저장된 내 가능 시간 밖입니다.';
  return '시간 정보가 부족하거나 유효하지 않아 포함 여부를 판단할 수 없습니다.';
}

function candidateTimeKey(candidate: Candidate) {
  return JSON.stringify([candidate.time.startsAt, candidate.time.endsAt]);
}

function conditionKey(condition: ParticipantCondition | null | undefined) {
  return JSON.stringify(
    condition
      ? [
          condition.availabilityWindows,
          condition.maxBudgetKrw,
          condition.preferences,
        ]
      : null
  );
}

export function getAutoFillDescription(
  form: ResponseForm,
  candidate: Candidate,
  condition: ParticipantCondition | null | undefined
) {
  if (!form.autoFill) return null;
  if (
    form.autoFill.candidateTimeKey !== candidateTimeKey(candidate) ||
    form.autoFill.conditionKey !== conditionKey(condition)
  ) {
    return '내 기준 또는 후보 시간이 바뀌었습니다. 이전 초안은 유지했습니다. 현재 안내를 확인하고 필요하면 내 기준으로 다시 채우기를 사용하세요. 직접 편집한 후보는 유지됩니다.';
  }
  return form.autoFill.reason;
}

export function editResponseForm(
  form: ResponseForm,
  update: ResponseSaveOverrides
): ResponseForm {
  return {
    ...form,
    ...update,
    manuallyEdited: true,
    autoFill: update.availabilityStatus !== undefined ? null : form.autoFill,
    message: '',
    messageKind: null,
  };
}

export function fillFormsFromCondition(
  current: Record<string, ResponseForm>,
  candidates: Candidate[],
  responses: ParticipantResponsePayload[],
  condition: ParticipantCondition | null | undefined,
  disabled = false
) {
  const active = candidates.filter(
    (candidate) => candidate.status === 'ACTIVE'
  );
  const next = { ...current };
  let applied = 0;
  const savedIds = new Set(responses.map((response) => response.candidateId));
  if (!disabled && condition) {
    for (const candidate of active) {
      const form = current[candidate.id] ?? createResponseForm();
      if (
        savedIds.has(candidate.id) ||
        form.savedResponseId ||
        form.manuallyEdited ||
        form.isSubmitting
      )
        continue;
      const match = getTimeMatch(candidate, condition);
      next[candidate.id] = {
        ...form,
        availabilityStatus: match === 'inside' ? 'AVAILABLE' : 'MAYBE',
        autoFill: {
          reason:
            match === 'inside'
              ? '내 가능 시간에 포함되어 가능으로 채웠습니다.'
              : match === 'outside'
                ? '내 가능 시간 밖이어서 보류로 채웠습니다.'
                : '시간 정보가 부족하거나 유효하지 않아 보류로 채웠습니다.',
          conditionKey: conditionKey(condition),
          candidateTimeKey: candidateTimeKey(candidate),
        },
        message: '',
        messageKind: null,
      };
      applied++;
    }
  }
  return { forms: next, applied, excluded: active.length - applied };
}

export function synchronizeResponseForms(
  current: Record<string, ResponseForm>,
  candidates: Candidate[],
  responses: ParticipantResponsePayload[]
) {
  const responsesById = new Map(
    responses.map((response) => [response.candidateId, response])
  );
  let next = current;
  for (const candidate of candidates) {
    const existing = current[candidate.id];
    if (
      existing &&
      (existing.isSubmitting ||
        existing.manuallyEdited ||
        isFormDirty(existing))
    )
      continue;
    const hydrated = createResponseForm(responsesById.get(candidate.id));
    if (
      !existing ||
      existing.savedResponseId !== hydrated.savedResponseId ||
      existing.savedAvailabilityStatus !== hydrated.savedAvailabilityStatus ||
      existing.savedTravelBurden !== hydrated.savedTravelBurden ||
      existing.savedNote !== hydrated.savedNote
    ) {
      next = { ...next, [candidate.id]: hydrated };
    }
  }
  return next;
}

export function formatCandidateTime(candidate: Candidate) {
  const startsAt = new Date(candidate.time.startsAt);
  const endsAt = new Date(candidate.time.endsAt);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return `${candidate.time.startsAt} ~ ${candidate.time.endsAt}`;
  }

  return `${startsAt.toLocaleString('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: MEETPOINT_TIMEZONE,
  })} ~ ${endsAt.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: MEETPOINT_TIMEZONE,
  })}`;
}

export function messageClassName(kind: ResponseMessageKind) {
  if (kind === 'success') {
    return 'text-emerald-700';
  }
  if (kind === 'info') {
    return 'text-slate-600';
  }

  return 'text-rose-600';
}

export function responseStateLabel(state: ReturnType<typeof getResponseState>) {
  if (state === 'saved') {
    return '의견 저장됨';
  }
  if (state === 'dirty') {
    return '변경 후 저장 필요';
  }

  return '의견 미저장';
}

export function responseStateClassName(
  state: ReturnType<typeof getResponseState>
) {
  if (state === 'saved') {
    return 'bg-emerald-50 text-emerald-700';
  }
  if (state === 'dirty') {
    return 'bg-amber-50 text-amber-700';
  }

  return 'bg-slate-100 text-slate-600';
}
