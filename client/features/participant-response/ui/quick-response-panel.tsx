"use client";

import {
  availabilityOptions,
  travelOptions,
} from "@/features/participant-response/model/response-form";
import type {
  AvailabilityStatus,
  TravelBurden,
} from "@/entities/participant-response";

type QuickResponsePanelProps = {
  isDisabled: boolean;
  availabilityStatus: AvailabilityStatus | null;
  travelBurden: TravelBurden | null;
  onAvailabilityChange: (value: AvailabilityStatus) => void;
  onTravelChange: (value: TravelBurden) => void;
  onSave: () => void;
};

export function QuickResponsePanel({
  isDisabled,
  availabilityStatus,
  travelBurden,
  onAvailabilityChange,
  onTravelChange,
  onSave,
}: QuickResponsePanelProps) {
  return (
    <section
      aria-labelledby="quick-response-heading"
      className="space-y-3"
    >
      <div className="space-y-2">
        <h3
          className="text-lg font-semibold text-slate-950"
          id="quick-response-heading"
        >
          한 번에 의견 입력
        </h3>
        <p className="text-sm leading-6 text-slate-600">
          같은 의견을 모든 후보에 적용합니다.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800">
            모든 후보의 참석 가능 여부
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {availabilityOptions.map((option) => (
              <button
                aria-pressed={availabilityStatus === option.value}
                className="mp-button mp-button-secondary min-h-12 break-keep px-1 text-xs aria-pressed:border-[var(--mp-purple)] aria-pressed:bg-[var(--mp-lilac)] aria-pressed:text-[var(--mp-purple-hover)] sm:text-sm"
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
            모든 후보의 이동 부담
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {travelOptions.map((option) => (
              <button
                aria-pressed={travelBurden === option.value}
                className="mp-button mp-button-secondary min-h-12 break-keep px-1 text-xs aria-pressed:border-[var(--mp-purple)] aria-pressed:bg-[var(--mp-lilac)] aria-pressed:text-[var(--mp-purple-hover)] sm:text-sm"
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
          className="mp-button mp-button-secondary w-full sm:w-auto"
          disabled={isDisabled || !availabilityStatus || !travelBurden}
          onClick={onSave}
          type="button"
        >
          같은 의견을 모든 후보에 저장
        </button>
      </div>

    </section>
  );
}
