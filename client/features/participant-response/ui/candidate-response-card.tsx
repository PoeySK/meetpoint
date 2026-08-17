"use client";

import type { Candidate } from "@/entities/candidate/model/types";
import {
  availabilityOptions,
  formatCandidateTime,
  getMissingFieldsDescription,
  getMissingFieldsMessage,
  getResponseState,
  messageClassName,
  responseStateClassName,
  responseStateLabel,
  travelOptions,
  type ResponseForm,
} from "@/features/participant-response/model/response-form";

type CandidateResponseCardProps = {
  candidate: Candidate;
  form: ResponseForm;
  isReadOnly: boolean;
  isBulkSubmitting: boolean;
  onUpdate: (update: Partial<ResponseForm>) => void;
  onSave: () => void;
};

export function CandidateResponseCard({
  candidate,
  form,
  isReadOnly,
  isBulkSubmitting,
  onUpdate,
  onSave,
}: CandidateResponseCardProps) {
  const responseState = getResponseState(form);
  const missingFieldsMessage = getMissingFieldsMessage(form);
  const missingFieldsDescription = getMissingFieldsDescription(form);
  const isDisabled = isReadOnly || form.isSubmitting || isBulkSubmitting;

  return (
    <article
      className={`rounded-2xl border bg-white p-5 shadow-sm ${
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
              아직 계산에 반영될 저장 응답이 없습니다.
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

      <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
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
                onClick={() =>
                  onUpdate({
                    availabilityStatus: option.value,
                    message: "",
                    messageKind: null,
                  })
                }
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
                onClick={() =>
                  onUpdate({
                    travelBurden: option.value,
                    message: "",
                    messageKind: null,
                  })
                }
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block space-y-2 text-sm font-semibold text-slate-800">
          메모 (선택)
          <textarea
            className="min-h-20 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50"
            disabled={isDisabled}
            maxLength={300}
            onChange={(event) =>
              onUpdate({
                note: event.target.value,
                message: "",
                messageKind: null,
              })
            }
            placeholder="참여자에게 공유할 메모"
            value={form.note}
          />
        </label>

        {missingFieldsMessage && (
          <p className="text-xs leading-5 text-amber-700">
            저장하려면 {missingFieldsDescription} 선택하지 않은 값은 Server에
            제출되지 않습니다.
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
          className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={isDisabled}
          onClick={onSave}
          type="button"
        >
          {form.isSubmitting
            ? "응답 저장 중..."
            : isBulkSubmitting
              ? "전체 후보 저장 중..."
              : "응답 저장"}
        </button>
      </div>
    </article>
  );
}
