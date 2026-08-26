"use client";

import {
  availabilityOptions,
  messageClassName,
  travelOptions,
  type PanelMessage,
} from "@/features/participant-response/model/response-form";
import type {
  AvailabilityStatus,
  TravelBurden,
} from "@/entities/participant-response";

type QuickResponsePanelProps = {
  isDisabled: boolean;
  availabilityStatus: AvailabilityStatus | null;
  travelBurden: TravelBurden | null;
  message: PanelMessage | null;
  onAvailabilityChange: (value: AvailabilityStatus) => void;
  onTravelChange: (value: TravelBurden) => void;
  onApply: () => void;
  onSave: () => void;
};

export function QuickResponsePanel({
  isDisabled,
  availabilityStatus,
  travelBurden,
  message,
  onAvailabilityChange,
  onTravelChange,
  onApply,
  onSave,
}: QuickResponsePanelProps) {
  return (
    <section
      aria-labelledby="quick-response-heading"
      className="rounded-xl border border-emerald-100 bg-emerald-50/55 p-4 sm:p-5"
    >
      <div className="space-y-2">
        <h3
          className="text-lg font-semibold text-slate-950"
          id="quick-response-heading"
        >
          빠른 응답 입력
        </h3>
        <p className="text-sm leading-6 text-slate-600">
          선택한 값을 전체 후보 폼에 먼저 적용합니다. &quot;전체 후보에 적용&quot;은
          입력만 채우며, 실제 저장은 별도로 확인해야 합니다.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800">
            전체 가능 여부
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {availabilityOptions.map((option) => (
              <button
                aria-pressed={availabilityStatus === option.value}
                className={`rounded-lg border px-2 py-2 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                  availabilityStatus === option.value
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-white bg-white text-slate-600 hover:border-emerald-300"
                }`}
                disabled={isDisabled}
                key={option.value}
                onClick={() => onAvailabilityChange(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800">
            전체 이동 부담
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {travelOptions.map((option) => (
              <button
                aria-pressed={travelBurden === option.value}
                className={`rounded-lg border px-2 py-2 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                  travelBurden === option.value
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-white bg-white text-slate-600 hover:border-slate-400"
                }`}
                disabled={isDisabled}
                key={option.value}
                onClick={() => onTravelChange(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          className="mp-button mp-button-secondary border-emerald-700 px-3 py-2 text-sm text-emerald-800 hover:border-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
          disabled={isDisabled}
          onClick={onApply}
          type="button"
        >
          전체 후보에 적용
        </button>
        <button
          className="mp-button w-full bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300 sm:w-auto"
          disabled={isDisabled}
          onClick={onSave}
          type="button"
        >
          전체 후보 저장
        </button>
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-600">
        이동 부담은 실제 거리나 시간이 아니라 참여자가 느끼는 자기 평가입니다.
        저장하지 않은 입력은 Server와 계산에 전달되지 않습니다.
      </p>
      {message && (
        <p
          aria-live="polite"
          className={`mt-3 text-sm leading-6 ${messageClassName(message.kind)}`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
