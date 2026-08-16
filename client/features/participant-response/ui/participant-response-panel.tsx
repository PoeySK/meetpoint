"use client";

import { useState } from "react";
import {
  RoomApiError,
  MEETPOINT_TIMEZONE,
  type AvailabilityStatus,
  type Candidate,
  type TravelBurden,
  upsertParticipantResponse,
} from "@/lib/rooms";

type ParticipantResponsePanelProps = {
  roomId: string;
  token: string;
  participantId: string;
  candidates: Candidate[];
};

type ResponseForm = {
  availabilityStatus: AvailabilityStatus;
  travelBurden: TravelBurden;
  note: string;
  message: string;
  isSubmitting: boolean;
};

const availabilityOptions: Array<{
  value: AvailabilityStatus;
  label: string;
}> = [
  { value: "AVAILABLE", label: "가능" },
  { value: "MAYBE", label: "보류" },
  { value: "UNAVAILABLE", label: "불가" },
];

const travelOptions: Array<{ value: TravelBurden; label: string }> = [
  { value: "EASY", label: "쉬움" },
  { value: "NORMAL", label: "보통" },
  { value: "HARD", label: "어려움" },
];

function createInitialResponse(): ResponseForm {
  return {
    availabilityStatus: "AVAILABLE",
    travelBurden: "NORMAL",
    note: "",
    message: "",
    isSubmitting: false,
  };
}

function describeResponseError(error: unknown) {
  if (error instanceof RoomApiError) {
    if (error.code === "TOKEN_EXPIRED" || error.code === "INVALID_TOKEN") {
      return "입장 토큰이 유효하지 않습니다. 방에 다시 입장해 주세요.";
    }
    if (error.code === "ROOM_STATE_CONFLICT") {
      return "현재 방 상태에서는 응답을 수정할 수 없습니다.";
    }
    if (error.code === "RESOURCE_NOT_FOUND") {
      return "응답 대상 후보를 찾을 수 없습니다.";
    }
    if (error.code === "VALIDATION_ERROR") {
      return "응답 입력을 다시 확인하세요.";
    }
  }

  return "응답을 저장하지 못했습니다. 잠시 후 다시 시도하세요.";
}

function formatCandidateTime(candidate: Candidate) {
  const startsAt = new Date(candidate.time.startsAt);
  const endsAt = new Date(candidate.time.endsAt);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return `${candidate.time.startsAt} ~ ${candidate.time.endsAt}`;
  }

  return `${startsAt.toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: MEETPOINT_TIMEZONE,
  })} ~ ${endsAt.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: MEETPOINT_TIMEZONE,
  })}`;
}

export function ParticipantResponsePanel({
  roomId,
  token,
  participantId,
  candidates,
}: ParticipantResponsePanelProps) {
  const [forms, setForms] = useState<Record<string, ResponseForm>>({});

  function updateForm(
    candidateId: string,
    update: Partial<ResponseForm>,
  ) {
    setForms((current) => ({
      ...current,
      [candidateId]: {
        ...(current[candidateId] ?? createInitialResponse()),
        ...update,
      },
    }));
  }

  async function saveResponse(candidateId: string) {
    const form = forms[candidateId] ?? createInitialResponse();
    updateForm(candidateId, { isSubmitting: true, message: "" });

    try {
      await upsertParticipantResponse(
        roomId,
        participantId,
        candidateId,
        token,
        {
          availabilityStatus: form.availabilityStatus,
          travelBurden: form.travelBurden,
          note: form.note.trim() || null,
        },
      );
      updateForm(candidateId, {
        isSubmitting: false,
        message: "저장됨 · 응답이 반영되었습니다.",
      });
    } catch (error) {
      updateForm(candidateId, {
        isSubmitting: false,
        message: describeResponseError(error),
      });
    }
  }

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-emerald-700">참여자 응답</p>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
          후보별 응답
        </h2>
        <p className="text-sm leading-6 text-slate-500">
          각 후보의 가능 여부와 이동 부담을 선택하세요. 다시 저장하면 기존 응답이
          수정됩니다.
        </p>
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-sm leading-6 text-slate-500">
          호스트가 후보를 등록하면 이곳에서 응답할 수 있습니다.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {candidates.map((candidate) => {
            const form = forms[candidate.id] ?? createInitialResponse();

            return (
              <article
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                key={candidate.id}
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
                          className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-emerald-100 ${
                            form.availabilityStatus === option.value
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300"
                          }`}
                          key={option.value}
                          onClick={() =>
                            updateForm(candidate.id, {
                              availabilityStatus: option.value,
                              message: "",
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
                          className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-emerald-100 ${
                            form.travelBurden === option.value
                              ? "border-slate-950 bg-slate-950 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                          }`}
                          key={option.value}
                          onClick={() =>
                            updateForm(candidate.id, {
                              travelBurden: option.value,
                              message: "",
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
                      className="min-h-20 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                      maxLength={300}
                      onChange={(event) =>
                        updateForm(candidate.id, {
                          note: event.target.value,
                          message: "",
                        })
                      }
                      placeholder="참여자에게 공유할 메모"
                      value={form.note}
                    />
                  </label>

                  {form.message && (
                    <p
                      aria-live="polite"
                      className={`text-sm leading-6 ${
                        form.message.startsWith("저장됨")
                          ? "text-emerald-700"
                          : "text-rose-600"
                      }`}
                    >
                      {form.message}
                    </p>
                  )}

                  <button
                    className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-300"
                    disabled={form.isSubmitting}
                    onClick={() => void saveResponse(candidate.id)}
                    type="button"
                  >
                    {form.isSubmitting ? "응답 저장 중..." : "응답 저장"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
