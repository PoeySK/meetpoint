"use client";

import { useState, type FormEvent } from "react";
import {
  createCandidate,
  MEETPOINT_TIMEZONE,
  RoomApiError,
  type Candidate,
  type CreateCandidateInput,
  type RoomDetailsResponse,
} from "@/lib/rooms";

type CandidateManagementPanelProps = {
  roomId: string;
  token: string;
  participantId: string;
  room: RoomDetailsResponse;
  onCandidateCreated: (candidate: Candidate) => void;
};

type FieldErrors = {
  date?: string;
  time?: string;
  place?: string;
  cost?: string;
  tags?: string;
};

type CalendarMonth = {
  year: number;
  month: number;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const TIME_PRESETS = [
  { label: "점심 12–14시", start: "12:00", end: "14:00" },
  { label: "저녁 18–20시", start: "18:00", end: "20:00" },
  { label: "저녁 19–21시", start: "19:00", end: "21:00" },
];

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateValue(year: number, month: number, day: number) {
  return `${year}-${padNumber(month)}-${padNumber(day)}`;
}

function parseDateValue(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function getKstDateParts(): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: MEETPOINT_TIMEZONE,
    year: "numeric",
  }).formatToParts(new Date());

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function getKstDateValue(offsetDays = 0) {
  const today = getKstDateParts();
  const shiftedDate = new Date(
    Date.UTC(today.year, today.month - 1, today.day + offsetDays),
  );

  return formatDateValue(
    shiftedDate.getUTCFullYear(),
    shiftedDate.getUTCMonth() + 1,
    shiftedDate.getUTCDate(),
  );
}

function getKstWeekdayDate(targetWeekday: number) {
  const today = getKstDateParts();
  const todayDate = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const daysUntilTarget =
    (targetWeekday - todayDate.getUTCDay() + WEEKDAYS.length) % WEEKDAYS.length;
  const targetDate = new Date(
    Date.UTC(today.year, today.month - 1, today.day + daysUntilTarget),
  );

  return formatDateValue(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth() + 1,
    targetDate.getUTCDate(),
  );
}

function formatDateLabel(value: string) {
  if (!parseDateValue(value)) {
    return "날짜를 선택하세요";
  }

  return new Date(`${value}T00:00:00+09:00`).toLocaleDateString("ko-KR", {
    day: "numeric",
    month: "long",
    timeZone: MEETPOINT_TIMEZONE,
    weekday: "short",
    year: "numeric",
  });
}

function getCalendarDays(month: CalendarMonth) {
  const firstWeekday = new Date(
    Date.UTC(month.year, month.month - 1, 1),
  ).getUTCDay();
  const daysInMonth = new Date(
    Date.UTC(month.year, month.month, 0),
  ).getUTCDate();

  return [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
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

function buildKstDateTime(date: string, time: string) {
  return `${date}T${time}:00+09:00`;
}

function validateCandidateForm(
  date: string,
  startTime: string,
  endTime: string,
  placeName: string,
  address: string,
  area: string,
  cost: string,
  tags: string,
) {
  const errors: FieldErrors = {};
  const parsedStartTime = parseTimeValue(startTime);
  const parsedEndTime = parseTimeValue(endTime);
  const parsedCost = Number(cost);

  if (!parseDateValue(date)) {
    errors.date = "모임 날짜를 선택하세요.";
  }

  if (parsedStartTime === null || parsedEndTime === null) {
    errors.time = "시작 시간과 종료 시간을 입력하세요.";
  } else if (parsedEndTime <= parsedStartTime) {
    errors.time = "종료 시간은 시작 시간보다 늦어야 합니다.";
  }

  if (
    !placeName.trim() ||
    placeName.trim().length > 120 ||
    !address.trim() ||
    address.trim().length > 120 ||
    !area.trim()
  ) {
    errors.place = "장소명·주소는 1~120자, 지역은 필수입니다.";
  }

  if (
    !cost.trim() ||
    !Number.isInteger(parsedCost) ||
    parsedCost < 0 ||
    parsedCost > 2_000_000
  ) {
    errors.cost = "1인 예상 비용은 0~2,000,000원 정수로 입력하세요.";
  }

  const normalizedTags = tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (normalizedTags.length > 10) {
    errors.tags = "태그는 최대 10개까지 입력할 수 있습니다.";
  }

  return errors;
}

function describeCandidateError(error: unknown) {
  if (error instanceof RoomApiError) {
    if (error.code === "CANDIDATE_LIMIT_EXCEEDED") {
      return "활성 후보는 최대 5개까지 등록할 수 있습니다.";
    }
    if (error.code === "HOST_ONLY") {
      return "호스트만 후보를 등록할 수 있습니다.";
    }
    if (error.code === "ROOM_STATE_CONFLICT") {
      return "현재 방 상태에서는 후보를 등록할 수 없습니다.";
    }
    if (error.code === "VALIDATION_ERROR") {
      return "후보 입력을 다시 확인하세요.";
    }
  }

  return "후보를 등록하지 못했습니다. 잠시 후 다시 시도하세요.";
}

function CandidateDatePicker({
  error,
  onChange,
  value,
}: {
  error?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<CalendarMonth | null>(null);
  const selectedDate = parseDateValue(value);

  function openCalendar() {
    const dateToShow = selectedDate ?? getKstDateParts();
    setVisibleMonth({ year: dateToShow.year, month: dateToShow.month });
    setIsOpen(true);
  }

  function moveMonth(offset: number) {
    if (!visibleMonth) {
      return;
    }

    const movedMonth = new Date(
      Date.UTC(visibleMonth.year, visibleMonth.month - 1 + offset, 1),
    );
    setVisibleMonth({
      year: movedMonth.getUTCFullYear(),
      month: movedMonth.getUTCMonth() + 1,
    });
  }

  return (
    <div className="relative">
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={`flex w-full items-center justify-between rounded-xl border bg-white px-4 py-3 text-left text-base outline-none transition focus:ring-4 focus:ring-emerald-100 ${
          error
            ? "border-rose-400"
            : "border-slate-300 focus:border-emerald-500"
        }`}
        onClick={() => (isOpen ? setIsOpen(false) : openCalendar())}
        type="button"
      >
        <span className={selectedDate ? "text-slate-950" : "text-slate-400"}>
          {formatDateLabel(value)}
        </span>
        <span aria-hidden="true" className="text-slate-400">
          {isOpen ? "⌃" : "⌄"}
        </span>
      </button>

      {isOpen && visibleMonth && (
        <div
          aria-label="모임 날짜 선택"
          className="absolute z-20 mt-2 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/60"
          id="candidate-date-calendar"
          role="dialog"
        >
          <div className="mb-4 flex items-center justify-between">
            <button
              aria-label="이전 달"
              className="rounded-lg px-3 py-2 text-lg text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              onClick={() => moveMonth(-1)}
              type="button"
            >
              ‹
            </button>
            <p aria-live="polite" className="font-semibold text-slate-950">
              {visibleMonth.year}년 {visibleMonth.month}월
            </p>
            <button
              aria-label="다음 달"
              className="rounded-lg px-3 py-2 text-lg text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              onClick={() => moveMonth(1)}
              type="button"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {getCalendarDays(visibleMonth).map((day, index) => {
              if (day === null) {
                return <span aria-hidden="true" key={`empty-${index}`} />;
              }

              const dayValue = formatDateValue(
                visibleMonth.year,
                visibleMonth.month,
                day,
              );
              const isSelected = value === dayValue;

              return (
                <button
                  aria-label={`${visibleMonth.year}년 ${visibleMonth.month}월 ${day}일`}
                  aria-pressed={isSelected}
                  className={`rounded-lg px-1 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-200 ${
                    isSelected
                      ? "bg-emerald-600 font-semibold text-white"
                      : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                  }`}
                  key={dayValue}
                  onClick={() => {
                    onChange(dayValue);
                    setIsOpen(false);
                  }}
                  type="button"
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs font-normal text-rose-600">{error}</p>
      )}
    </div>
  );
}

export function CandidateManagementPanel({
  roomId,
  token,
  participantId,
  room,
  onCandidateCreated,
}: CandidateManagementPanelProps) {
  const isHost = participantId === room.room.hostParticipantId;
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [cost, setCost] = useState("");
  const [tags, setTags] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isHost) {
    return null;
  }

  const isRoomClosed =
    room.room.status === "CONFIRMED" || room.room.status === "CLOSED";
  const hasReachedCandidateLimit = room.candidates.length >= 5;
  const nextCandidateNumber = room.candidates.length + 1;

  function clearCandidateForm() {
    setDate("");
    setStartTime("");
    setEndTime("");
    setPlaceName("");
    setAddress("");
    setArea("");
    setCost("");
    setTags("");
    setFieldErrors({});
    setFormError("");
  }

  function fillExample() {
    setDate(getKstDateValue(1));
    setStartTime("19:00");
    setEndTime("21:00");
    setPlaceName("강남역 조용한 식당");
    setAddress("서울 강남구 테헤란로 1");
    setArea("강남");
    setCost("28000");
    setTags("조용함, 실내");
    setFieldErrors({});
    setFormError("");
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

  function applyTimeChange(
    setter: (value: string) => void,
    value: string,
  ) {
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
      tags,
    );
    setFieldErrors(errors);
    setFormError("");

    if (Object.keys(errors).length > 0) {
      return;
    }

    const normalizedTags = tags
      .split(",")
      .map((tag) => tag.trim().toUpperCase())
      .filter(Boolean);
    const input: CreateCandidateInput = {
      displayOrder: nextCandidateNumber,
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
      const response = await createCandidate(roomId, token, input);
      onCandidateCreated(response.candidate);
      clearCandidateForm();
    } catch (error) {
      setFormError(describeCandidateError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-emerald-100 bg-emerald-50/60 p-5 sm:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-emerald-700">호스트</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
            장소 후보 등록
          </h2>
          <p className="text-sm leading-6 text-slate-600">
            참여자들이 비교할 시간과 장소를 최대 5개까지 등록할 수 있습니다.
          </p>
        </div>
        <span className="w-fit rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-slate-600">
          {room.candidates.length} / 5개
        </span>
      </div>

      <div className="mb-5 rounded-2xl border border-emerald-100 bg-white/80 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">빠른 입력</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              예시를 채워 입력 방법을 확인하거나 테스트 시간을 줄일 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              onClick={fillExample}
              type="button"
            >
              예시로 채우기
            </button>
            <button
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-500 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              onClick={clearCandidateForm}
              type="button"
            >
              입력 지우기
            </button>
          </div>
        </div>
      </div>

      {isRoomClosed ? (
        <p className="rounded-xl bg-white px-4 py-3 text-sm leading-6 text-slate-600">
          확정되거나 종료된 방에는 새 후보를 등록할 수 없습니다.
        </p>
      ) : hasReachedCandidateLimit ? (
        <p className="rounded-xl bg-white px-4 py-3 text-sm leading-6 text-slate-600">
          활성 후보 5개가 등록되어 더 추가할 수 없습니다.
        </p>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <div className="rounded-2xl border border-emerald-100 bg-white/70 px-4 py-3 text-sm text-emerald-800">
            후보 {nextCandidateNumber}번으로 저장됩니다. 모든 시간은 한국 시간
            기준입니다.
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-800">
              모임 날짜
            </legend>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-emerald-400 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                onClick={() => applyDate(getKstDateValue())}
                type="button"
              >
                오늘
              </button>
              <button
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-emerald-400 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                onClick={() => applyDate(getKstDateValue(1))}
                type="button"
              >
                내일
              </button>
              <button
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-emerald-400 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                onClick={() => applyDate(getKstWeekdayDate(6))}
                type="button"
              >
                이번 토요일
              </button>
            </div>
            <CandidateDatePicker
              error={fieldErrors.date}
              onChange={applyDate}
              value={date}
            />
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-800">
              시간
            </legend>
            <div className="flex flex-wrap gap-2">
              {TIME_PRESETS.map((preset) => (
                <button
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-emerald-400 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  key={preset.label}
                  onClick={() => applyTimePreset(preset.start, preset.end)}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-semibold text-slate-800">
                시작 시간
                <input
                  aria-invalid={Boolean(fieldErrors.time)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  onChange={(event) =>
                    applyTimeChange(setStartTime, event.target.value)
                  }
                  type="time"
                  value={startTime}
                />
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-800">
                종료 시간
                <input
                  aria-invalid={Boolean(fieldErrors.time)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  onChange={(event) =>
                    applyTimeChange(setEndTime, event.target.value)
                  }
                  type="time"
                  value={endTime}
                />
              </label>
            </div>
            {fieldErrors.time && (
              <p className="text-xs font-normal text-rose-600">
                {fieldErrors.time}
              </p>
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-slate-800">
              장소명
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                maxLength={120}
                onChange={(event) => setPlaceName(event.target.value)}
                placeholder="예: MeetPoint Cafe"
                value={placeName}
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-800">
              지역
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                onChange={(event) => setArea(event.target.value)}
                placeholder="예: 중구"
                value={area}
              />
            </label>
          </div>
          <label className="block space-y-2 text-sm font-semibold text-slate-800">
            주소
            <input
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              maxLength={120}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="예: 서울 중구 1"
              value={address}
            />
          </label>
          {fieldErrors.place && (
            <p className="-mt-3 text-xs text-rose-600">{fieldErrors.place}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-slate-800">
              1인 예상 비용 (원)
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                inputMode="numeric"
                min="0"
                onChange={(event) => setCost(event.target.value)}
                type="number"
                value={cost}
              />
              {fieldErrors.cost && (
                <span className="block text-xs font-normal text-rose-600">
                  {fieldErrors.cost}
                </span>
              )}
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-800">
              태그
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                onChange={(event) => setTags(event.target.value)}
                placeholder="쉼표로 구분 (예: 조용함, 커피)"
                value={tags}
              />
              {fieldErrors.tags && (
                <span className="block text-xs font-normal text-rose-600">
                  {fieldErrors.tags}
                </span>
              )}
            </label>
          </div>

          {formError && (
            <p
              aria-live="polite"
              className="rounded-xl bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700"
            >
              {formError}
            </p>
          )}

          <button
            className="w-full rounded-xl bg-emerald-700 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "후보 등록 중..." : "후보 등록"}
          </button>
        </form>
      )}
    </section>
  );
}
