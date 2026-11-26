"use client";

import { useId, type FormEvent } from "react";
import {
  CandidateDatePicker,
  getKstDateValue,
  getKstWeekdayDate,
} from "@/features/candidate-management/ui/candidate-date-picker";

export type CandidateFieldErrors = {
  date?: string;
  time?: string;
  place?: string;
  cost?: string;
  tags?: string;
};

type CandidateFormProps = {
  nextCandidateNumber: number;
  mode?: "create" | "edit";
  date: string;
  startTime: string;
  endTime: string;
  placeName: string;
  address: string;
  area: string;
  cost: string;
  tags: string;
  fieldErrors: CandidateFieldErrors;
  formError: string;
  isSubmitting: boolean;
  onCancel?: () => void;
  onFillExample: () => void;
  onClear: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDateChange: (value: string) => void;
  onTimePreset: (start: string, end: string) => void;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  onPlaceNameChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  onAreaChange: (value: string) => void;
  onCostChange: (value: string) => void;
  onTagsChange: (value: string) => void;
};

const TIME_PRESETS = [
  { label: "점심", start: "12:00", end: "14:00" },
  { label: "저녁", start: "18:00", end: "20:00" },
  { label: "저녁", start: "19:00", end: "21:00" },
];

const presetClassName = "mp-button mp-button-secondary min-h-10 rounded-lg py-1.5 aria-pressed:border-[var(--mp-purple)] aria-pressed:bg-[var(--mp-lilac)] aria-pressed:text-[var(--mp-purple-hover)]";

export function CandidateForm({
  nextCandidateNumber,
  mode = "create",
  date,
  startTime,
  endTime,
  placeName,
  address,
  area,
  cost,
  tags,
  fieldErrors,
  formError,
  isSubmitting,
  onCancel,
  onFillExample,
  onClear,
  onSubmit,
  onDateChange,
  onTimePreset,
  onStartTimeChange,
  onEndTimeChange,
  onPlaceNameChange,
  onAddressChange,
  onAreaChange,
  onCostChange,
  onTagsChange,
}: CandidateFormProps) {
  const errorId = useId();

  const datePresets = [
    { label: "오늘", value: getKstDateValue() },
    { label: "내일", value: getKstDateValue(1) },
    { label: "이번 토요일", value: getKstWeekdayDate(6) },
  ];

  return (
    <form className="space-y-4 sm:space-y-5" onSubmit={onSubmit} noValidate>
      {mode === "edit" && <p className="text-sm font-semibold text-slate-700">후보 {nextCandidateNumber}번 수정</p>}
      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <fieldset className="min-w-0 space-y-3">
          <legend className="mb-2 font-bold">장소와 비용</legend>
          <label className="block space-y-1 text-sm font-semibold text-slate-800">
            장소명
            <input aria-describedby={fieldErrors.place ? `${errorId}-place` : undefined} aria-invalid={Boolean(fieldErrors.place && !placeName.trim())} className="mp-input rounded-lg aria-invalid:border-rose-600" disabled={isSubmitting} maxLength={120} onChange={(event) => onPlaceNameChange(event.target.value)} placeholder="예: 시청 앞 식당" required value={placeName} />
          </label>
          <label className="block space-y-1 text-sm font-semibold text-slate-800">
            주소
            <input aria-describedby={fieldErrors.place ? `${errorId}-place` : undefined} aria-invalid={Boolean(fieldErrors.place && !address.trim())} className="mp-input rounded-lg aria-invalid:border-rose-600" disabled={isSubmitting} maxLength={120} onChange={(event) => onAddressChange(event.target.value)} placeholder="예: 서울 중구 1" required value={address} />
          </label>
          {fieldErrors.place && <p className="text-xs text-rose-700" id={`${errorId}-place`}>{fieldErrors.place}</p>}
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1 space-y-1 text-sm font-semibold text-slate-800">
              1인 예상 비용 (원)
              <input aria-describedby={fieldErrors.cost ? `${errorId}-cost` : undefined} aria-invalid={Boolean(fieldErrors.cost)} className="mp-input rounded-lg aria-invalid:border-rose-600" disabled={isSubmitting} inputMode="numeric" min="0" onChange={(event) => onCostChange(event.target.value)} placeholder="예: 25000" required type="number" value={cost} />
            </label>
            <button aria-pressed={cost.trim() === "0"} className={`${presetClassName} shrink-0 px-3`} disabled={isSubmitting} onClick={() => onCostChange("0")} type="button">무료</button>
          </div>
          {fieldErrors.cost && <p className="text-xs text-rose-700" id={`${errorId}-cost`}>{fieldErrors.cost}</p>}
        </fieldset>

        <fieldset className="min-w-0 space-y-3">
          <legend className="mb-2 font-bold">날짜와 시간 <span className="text-sm font-normal text-[var(--mp-muted)]">한국 시간</span></legend>
          <div className="space-y-2">
            <CandidateDatePicker disabled={isSubmitting} error={fieldErrors.date} onChange={onDateChange} value={date} />
            <div className="flex flex-wrap gap-1.5" aria-label="빠른 날짜 선택" role="group">
              {datePresets.map(({ label, value }) => (
                <button aria-pressed={date === value} className={`${presetClassName} px-3`} disabled={isSubmitting} key={label} onClick={() => onDateChange(value)} type="button">{label}</button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="min-w-0 space-y-1 text-sm font-semibold text-slate-800">
                시작 시간
                <input
                  aria-describedby={fieldErrors.time ? `${errorId}-time` : undefined}
                  aria-invalid={Boolean(fieldErrors.time && !startTime)}
                  className="mp-input rounded-lg aria-invalid:border-rose-600"
                  disabled={isSubmitting}
                  onChange={(event) => onStartTimeChange(event.target.value)}
                  required
                  type="time"
                  value={startTime}
                />
              </label>
              <label className="min-w-0 space-y-1 text-sm font-semibold text-slate-800">
                종료 시간
                <input
                  aria-describedby={fieldErrors.time ? `${errorId}-time` : undefined}
                  aria-invalid={Boolean(fieldErrors.time && (!endTime || startTime))}
                  className="mp-input rounded-lg aria-invalid:border-rose-600"
                  disabled={isSubmitting}
                  onChange={(event) => onEndTimeChange(event.target.value)}
                  required
                  type="time"
                  value={endTime}
                />
              </label>
            </div>
            {fieldErrors.time && <p className="text-xs text-rose-700" id={`${errorId}-time`}>{fieldErrors.time}</p>}
            <div className="grid grid-cols-3 gap-1.5" aria-label="빠른 시간 선택" role="group">
              {TIME_PRESETS.map((preset) => (
                <button
                  aria-label={`${preset.label} ${preset.start}~${preset.end}`}
                  aria-pressed={startTime === preset.start && endTime === preset.end}
                  className={`${presetClassName} min-w-0 px-1`}
                  disabled={isSubmitting}
                  key={preset.start}
                  onClick={() => onTimePreset(preset.start, preset.end)}
                  type="button"
                >
                  <span className="block text-sm font-semibold leading-tight">{preset.label}</span>
                  <span className="block whitespace-nowrap text-xs leading-tight">{preset.start}~{preset.end}</span>
                </button>
              ))}
            </div>
          </div>
        </fieldset>
      </div>

      <details className="border-t border-[var(--mp-line)] pt-2 text-sm text-slate-700" open={fieldErrors.tags ? true : undefined}>
        <summary className="cursor-pointer py-2 font-semibold">추가 항목과 입력 도구</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 font-semibold">
            지역
            <input className="mp-input" disabled={isSubmitting} onChange={(event) => onAreaChange(event.target.value)} placeholder="예: 중구" value={area} />
          </label>
          <label className="space-y-1 font-semibold">
            특징
            <input aria-describedby={fieldErrors.tags ? `${errorId}-tags` : undefined} aria-invalid={Boolean(fieldErrors.tags)} className="mp-input aria-invalid:border-rose-600" disabled={isSubmitting} onChange={(event) => onTagsChange(event.target.value)} placeholder="예: 조용함, 주차 가능" value={tags} />
            {fieldErrors.tags && <span className="block text-xs font-normal text-rose-700" id={`${errorId}-tags`}>{fieldErrors.tags}</span>}
          </label>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4">
          <button className="min-h-11 font-semibold text-[var(--mp-purple)] underline-offset-4 hover:underline disabled:opacity-50" disabled={isSubmitting} onClick={onFillExample} type="button">예시로 채우기</button>
          <button className="min-h-11 font-semibold text-[var(--mp-muted)] underline-offset-4 hover:underline disabled:opacity-50" disabled={isSubmitting} onClick={onClear} type="button">입력 지우기</button>
        </div>
      </details>

      {formError && <p aria-live="polite" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <button className="mp-button mp-button-accent min-h-11 w-full rounded-lg sm:w-auto" disabled={isSubmitting} type="submit">
          {isSubmitting ? "저장 중..." : mode === "edit" ? "수정 내용 저장" : "후보 등록"}
        </button>
        {onCancel && (
          <button className="mp-button mp-button-secondary min-h-11 w-full rounded-lg sm:w-auto" disabled={isSubmitting} onClick={onCancel} type="button">
            {mode === "edit" ? "수정 취소" : "닫기"}
          </button>
        )}
      </div>
    </form>
  );
}
