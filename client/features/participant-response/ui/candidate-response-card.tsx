"use client";

import type { Candidate } from "@/entities/candidate";
import type { ParticipantCondition } from "@/entities/participant-condition";
import {
  availabilityOptions,
  formatCandidateTime,
  getConditionWarnings,
  getMissingFieldsDescription,
  getMissingFieldsMessage,
  getResponseState,
  messageClassName,
  responseStateClassName,
  responseStateLabel,
  travelOptions,
  type ResponseSaveOverrides,
  type ResponseForm,
} from "@/features/participant-response/model/response-form";

type CandidateResponseCardProps = {
  candidate: Candidate;
  condition: ParticipantCondition | null | undefined;
  form: ResponseForm;
  isReadOnly: boolean;
  isBulkSubmitting: boolean;
  onUpdate: (update: Partial<ResponseForm>) => void;
  onSave: (overrides?: ResponseSaveOverrides) => void;
};

export function CandidateResponseCard({
  candidate,
  condition,
  form,
  isReadOnly,
  isBulkSubmitting,
  onUpdate,
  onSave,
}: CandidateResponseCardProps) {
  const responseState = getResponseState(form);
  const missingFieldsMessage = getMissingFieldsMessage(form);
  const missingFieldsDescription = getMissingFieldsDescription(form);
  const conditionWarnings = getConditionWarnings(
    candidate,
    condition,
    form.availabilityStatus,
  );
  const isDisabled = isReadOnly || form.isSubmitting || isBulkSubmitting;

  function updateResponse(update: ResponseSaveOverrides) {
    onUpdate({ ...update, message: "", messageKind: null });

    const availabilityStatus =
      update.availabilityStatus ?? form.availabilityStatus;
    const travelBurden = update.travelBurden ?? form.travelBurden;
    if (availabilityStatus && travelBurden && !isDisabled) {
      onSave({ availabilityStatus, travelBurden });
    }
  }

  return (
    <article
      className={`mp-card rounded-xl p-4 shadow-none ${
        responseState === "saved"
          ? "border-emerald-200"
          : responseState === "dirty"
            ? "border-amber-200"
            : "border-slate-200"
      }`}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-950">
            {candidate.place.name}
          </h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            후보 {candidate.displayOrder}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${responseStateClassName(responseState)}`}
          >
            {responseStateLabel(responseState)}
          </span>
          {responseState === "missing" && (
            <span className="text-xs text-slate-500">
              아직 추천 결과에 반영될 저장된 의견이 없습니다.
            </span>
          )}
        </div>
        <p className="text-sm text-slate-600">
          {formatCandidateTime(candidate)}
        </p>
        <p className="text-sm text-slate-600">
          {candidate.place.address} · {candidate.place.area}
        </p>
        <p className="text-sm font-medium text-slate-700">
          1인 약 {candidate.estimatedCostPerPersonKrw.toLocaleString("ko-KR")}원
        </p>
        {candidate.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {candidate.tags.map((tag) => (
              <span
                className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                key={tag}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800">
            참석 가능 여부
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {availabilityOptions.map((option) => (
              <button
                aria-pressed={form.availabilityStatus === option.value}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                  form.availabilityStatus === option.value
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300"
                }`}
                disabled={isDisabled}
                key={option.value}
                onClick={() => updateResponse({ availabilityStatus: option.value })}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800">
            이동 부담
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {travelOptions.map((option) => (
              <button
                aria-pressed={form.travelBurden === option.value}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                  form.travelBurden === option.value
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                }`}
                disabled={isDisabled}
                key={option.value}
                onClick={() => updateResponse({ travelBurden: option.value })}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        {conditionWarnings.length > 0 && (
          <div
            aria-live="polite"
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-800"
          >
            <p className="font-semibold">내 기준과 다른 점이 있어요.</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {conditionWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs">
              그래도 이 선택은 저장됩니다. 추천 결과에서 함께 확인할 수 있습니다.
            </p>
          </div>
        )}

        <label className="block space-y-2 text-sm font-semibold text-slate-800">
          메모 (선택)
          <textarea
            className="mp-input min-h-20 resize-y disabled:cursor-not-allowed disabled:bg-slate-50"
            disabled={isDisabled}
            maxLength={300}
            onChange={(event) =>
              onUpdate({
                note: event.target.value,
                message: "",
                messageKind: null,
              })
            }
            placeholder="함께 볼 메모"
            value={form.note}
          />
        </label>

        {missingFieldsMessage && (
          <p className="text-xs leading-5 text-amber-700">
            저장하려면 {missingFieldsDescription} 아직 선택하지 않은 값은 저장되지
            않습니다.
          </p>
        )}

        {form.message && form.messageKind && (
          <p
            aria-live="polite"
            className={`text-sm leading-6 ${messageClassName(form.messageKind)}`}
          >
            {form.message}
          </p>
        )}

        <button
          className="mp-button mp-button-primary w-full"
          disabled={isDisabled}
          onClick={() => onSave()}
          type="button"
        >
          {form.isSubmitting
            ? "저장 중..."
            : isBulkSubmitting
              ? "전체 저장 중..."
              : responseState === "dirty"
                ? "변경 저장"
                : "의견 저장"}
        </button>
      </div>
    </article>
  );
}
