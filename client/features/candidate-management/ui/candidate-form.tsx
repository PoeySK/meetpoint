"use client";

import type { FormEvent } from "react";
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
  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-slate-800">
          모임 일시 <span className="font-normal text-slate-600">(한국 시간)</span>
        </legend>
        {mode === "edit" && <p className="text-xs text-slate-600">후보 {nextCandidateNumber}번 수정</p>}
        <CandidateDatePicker disabled={isSubmitting} error={fieldErrors.date} onChange={onDateChange} value={date} />
        <div className="grid grid-cols-2 gap-3">
          <label className="min-w-0 space-y-1 text-sm font-semibold text-slate-800">
            시작 시간
            <input
              aria-invalid={Boolean(fieldErrors.time)}
              className="mp-input"
              disabled={isSubmitting}
              id="candidate-start-time"
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
              className="mp-input"
              disabled={isSubmitting}
              onChange={(event) => onEndTimeChange(event.target.value)}
              required
              type="time"
              value={endTime}
            />
          </label>
        </div>
        {fieldErrors.time && <p className="text-xs text-rose-700">{fieldErrors.time}</p>}
        <details className="text-sm text-slate-700">
          <summary className="cursor-pointer py-1 font-semibold">날짜·시간 빠른 선택</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="mp-button mp-button-secondary px-3 py-1.5 text-xs" onClick={() => onDateChange(getKstDateValue())} disabled={isSubmitting} type="button">오늘</button>
            <button className="mp-button mp-button-secondary px-3 py-1.5 text-xs" onClick={() => onDateChange(getKstDateValue(1))} disabled={isSubmitting} type="button">내일</button>
            <button className="mp-button mp-button-secondary px-3 py-1.5 text-xs" onClick={() => onDateChange(getKstWeekdayDate(6))} disabled={isSubmitting} type="button">이번 토요일</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {TIME_PRESETS.map((preset) => (
              <button
                className="mp-button mp-button-secondary px-3 py-1.5 text-xs"
                disabled={isSubmitting}
                key={preset.label}
                onClick={() => onTimePreset(preset.start, preset.end)}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </details>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold text-slate-800">
          장소명
          <input
            className="mp-input"
            disabled={isSubmitting}
            maxLength={120}
            onChange={(event) => onPlaceNameChange(event.target.value)}
            placeholder="예: 시청 앞 식당"
            required
            value={placeName}
          />
        </label>
        <label className="space-y-1 text-sm font-semibold text-slate-800">
          주소
          <input
            className="mp-input"
            disabled={isSubmitting}
            maxLength={120}
            onChange={(event) => onAddressChange(event.target.value)}
            placeholder="예: 서울 중구 1"
            required
            value={address}
          />
        </label>
      </div>
      {fieldErrors.place && <p className="text-xs text-rose-700">{fieldErrors.place}</p>}

      <label className="block space-y-1 text-sm font-semibold text-slate-800 sm:max-w-xs">
        1인 예상 비용 (원)
        <input
          className="mp-input"
          disabled={isSubmitting}
          inputMode="numeric"
          min="0"
          onChange={(event) => onCostChange(event.target.value)}
          placeholder="무료라면 0"
          required
          type="number"
          value={cost}
        />
        {fieldErrors.cost && <span className="block text-xs font-normal text-rose-700">{fieldErrors.cost}</span>}
      </label>

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
        <button className="mp-button mp-button-primary w-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? "저장 중..." : mode === "edit" ? "수정 내용 저장" : "후보 등록"}
        </button>
        {mode === "edit" && onCancel && (
          <button className="mp-button mp-button-secondary w-full" disabled={isSubmitting} onClick={onCancel} type="button">
            수정 취소
          </button>
        )}
      </div>
    </form>
  );
}
