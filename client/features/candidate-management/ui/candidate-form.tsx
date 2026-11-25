"use client";

import { useEffect, useRef, type FormEvent } from "react";
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
  { label: "점심 12:00~14:00", start: "12:00", end: "14:00" },
  { label: "저녁 18:00~20:00", start: "18:00", end: "20:00" },
  { label: "저녁 19:00~21:00", start: "19:00", end: "21:00" },
];

const presetClassName = "mp-button mp-button-secondary min-h-10 rounded-lg px-3 py-1.5 text-xs aria-pressed:border-teal-600 aria-pressed:bg-teal-50 aria-pressed:text-teal-900";

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
  const manualTimeRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (fieldErrors.time && manualTimeRef.current) manualTimeRef.current.open = true;
  }, [fieldErrors]);

  const datePresets = [
    { label: "오늘", value: getKstDateValue() },
    { label: "내일", value: getKstDateValue(1) },
    { label: "이번 토요일", value: getKstWeekdayDate(6) },
  ];

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      {mode === "edit" && <p className="text-sm font-semibold text-slate-700">후보 {nextCandidateNumber}번 수정</p>}
      <div className="grid gap-5 xl:grid-cols-2">
        <fieldset className="min-w-0 space-y-3">
          <legend className="mb-2 font-bold text-slate-950">어디서 만날까요?</legend>
          <label className="block space-y-1 text-sm font-semibold text-slate-800">
            장소명
            <input className="mp-input rounded-lg" disabled={isSubmitting} maxLength={120} onChange={(event) => onPlaceNameChange(event.target.value)} placeholder="예: 시청 앞 식당" required value={placeName} />
          </label>
          <label className="block space-y-1 text-sm font-semibold text-slate-800">
            주소
            <input className="mp-input rounded-lg" disabled={isSubmitting} maxLength={120} onChange={(event) => onAddressChange(event.target.value)} placeholder="예: 서울 중구 1" required value={address} />
          </label>
          {fieldErrors.place && <p className="text-xs text-rose-700">{fieldErrors.place}</p>}
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1 space-y-1 text-sm font-semibold text-slate-800">
              1인 예상 비용 (원)
              <input className="mp-input rounded-lg" disabled={isSubmitting} inputMode="numeric" min="0" onChange={(event) => onCostChange(event.target.value)} placeholder="예: 25000" required type="number" value={cost} />
            </label>
            <button aria-pressed={cost.trim() === "0"} className={presetClassName} disabled={isSubmitting} onClick={() => onCostChange("0")} type="button">무료</button>
          </div>
          {fieldErrors.cost && <p className="text-xs text-rose-700">{fieldErrors.cost}</p>}
        </fieldset>

        <fieldset className="min-w-0 space-y-3">
          <legend className="mb-2 font-bold text-slate-950">언제 만날까요? <span className="text-xs font-normal text-slate-600">한국 시간</span></legend>
          <div className="flex flex-wrap gap-2" aria-label="빠른 날짜 선택" role="group">
            {datePresets.map(({ label, value }) => (
              <button aria-pressed={date === value} className={presetClassName} disabled={isSubmitting} key={label} onClick={() => onDateChange(value)} type="button">{label}</button>
            ))}
          </div>
          <CandidateDatePicker disabled={isSubmitting} error={fieldErrors.date} onChange={onDateChange} value={date} />
          <div className="flex flex-wrap gap-2" aria-label="빠른 시간 선택" role="group">
            {TIME_PRESETS.map((preset) => (
              <button aria-pressed={startTime === preset.start && endTime === preset.end} className={presetClassName} disabled={isSubmitting} key={preset.label} onClick={() => onTimePreset(preset.start, preset.end)} type="button">{preset.label}</button>
            ))}
          </div>
          <details className="text-sm text-slate-700" ref={manualTimeRef}>
            <summary className="cursor-pointer py-1 font-semibold">
              직접 시간 입력 {startTime && endTime && `· ${startTime}~${endTime}`}
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="min-w-0 space-y-1 text-sm font-semibold text-slate-800">
                시작 시간
                <input
                  aria-invalid={Boolean(fieldErrors.time)}
                  className="mp-input rounded-lg"
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
                  aria-invalid={Boolean(fieldErrors.time)}
                  className="mp-input rounded-lg"
                  disabled={isSubmitting}
                  onChange={(event) => onEndTimeChange(event.target.value)}
                  required
                  type="time"
                  value={endTime}
                />
              </label>
            </div>
          </details>
          {fieldErrors.time && <p className="text-xs text-rose-700">{fieldErrors.time}</p>}
        </fieldset>
      </div>

      <details className="text-sm text-slate-700" open={fieldErrors.tags ? true : undefined}>
        <summary className="cursor-pointer py-1 font-semibold">지역·장소 특징 (선택)</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 font-semibold">
            지역
            <input className="mp-input" disabled={isSubmitting} onChange={(event) => onAreaChange(event.target.value)} placeholder="예: 중구" value={area} />
          </label>
          <label className="space-y-1 font-semibold">
            특징
            <input className="mp-input" disabled={isSubmitting} onChange={(event) => onTagsChange(event.target.value)} placeholder="예: 조용함, 주차 가능" value={tags} />
            {fieldErrors.tags && <span className="block text-xs font-normal text-rose-700">{fieldErrors.tags}</span>}
          </label>
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
