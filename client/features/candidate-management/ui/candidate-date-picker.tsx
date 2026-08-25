"use client";

import { useState } from "react";
import { MEETPOINT_TIMEZONE } from "@/shared/config/meetpoint";

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

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateValue(year: number, month: number, day: number) {
  return `${year}-${padNumber(month)}-${padNumber(day)}`;
}

export function parseDateValue(value: string): DateParts | null {
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

export function getKstDateValue(offsetDays = 0) {
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

export function getKstWeekdayDate(targetWeekday: number) {
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

export function buildKstDateTime(date: string, time: string) {
  return `${date}T${time}:00+09:00`;
}

export function CandidateDatePicker({
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
        className={`mp-input flex items-center justify-between text-left ${
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
          className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-200/50"
          id="candidate-date-calendar"
          role="dialog"
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              aria-label="이전 달"
              className="rounded-lg px-2 py-1.5 text-base text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-200"
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
              className="rounded-lg px-2 py-1.5 text-base text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-200"
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
