"use client";

import { useState, type FormEvent } from "react";
import {
  createCandidate,
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
  displayOrder?: string;
  time?: string;
  timezone?: string;
  place?: string;
  cost?: string;
  tags?: string;
};

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function validateCandidateForm(
  displayOrder: string,
  startsAt: string,
  endsAt: string,
  timezone: string,
  placeName: string,
  address: string,
  area: string,
  cost: string,
  tags: string,
) {
  const errors: FieldErrors = {};
  const parsedDisplayOrder = Number(displayOrder);
  const parsedCost = Number(cost);
  const startDate = new Date(startsAt);
  const endDate = new Date(endsAt);

  if (!Number.isInteger(parsedDisplayOrder) || parsedDisplayOrder < 1) {
    errors.displayOrder = "표시 순서는 1 이상의 정수여야 합니다.";
  }

  if (
    !startsAt ||
    !endsAt ||
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    endDate.getTime() <= startDate.getTime()
  ) {
    errors.time = "시작 시간보다 늦은 종료 시간을 입력하세요.";
  }

  if (!timezone || !isValidTimezone(timezone)) {
    errors.timezone = "올바른 IANA 시간대를 입력하세요. 예: Asia/Seoul";
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
      return "HOST만 후보를 등록할 수 있습니다.";
    }
    if (error.code === "ROOM_STATE_CONFLICT") {
      return "현재 Room 상태에서는 후보를 등록할 수 없습니다.";
    }
    if (error.code === "VALIDATION_ERROR") {
      return "후보 입력을 다시 확인하세요.";
    }
  }

  return "후보를 등록하지 못했습니다. 잠시 후 다시 시도하세요.";
}

export function CandidateManagementPanel({
  roomId,
  token,
  participantId,
  room,
  onCandidateCreated,
}: CandidateManagementPanelProps) {
  const isHost = participantId === room.room.hostParticipantId;
  const [displayOrder, setDisplayOrder] = useState(
    String(room.candidates.length + 1),
  );
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [timezone, setTimezone] = useState(room.room.timezone);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateCandidateForm(
      displayOrder,
      startsAt,
      endsAt,
      timezone.trim(),
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
      displayOrder: Number(displayOrder),
      time: {
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        timezone: timezone.trim(),
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
      setDisplayOrder(String(room.candidates.length + 2));
      setStartsAt("");
      setEndsAt("");
      setPlaceName("");
      setAddress("");
      setArea("");
      setCost("");
      setTags("");
      setFieldErrors({});
    } catch (error) {
      setFormError(describeCandidateError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-emerald-100 bg-emerald-50/60 p-5 sm:p-8">
      <div className="mb-6 space-y-2">
        <p className="text-sm font-semibold text-emerald-700">HOST</p>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
          장소 후보 등록
        </h2>
        <p className="text-sm leading-6 text-slate-600">
          참여자들이 비교할 시간과 장소를 최대 5개까지 등록할 수 있습니다.
        </p>
      </div>

      {isRoomClosed ? (
        <p className="rounded-xl bg-white px-4 py-3 text-sm leading-6 text-slate-600">
          확정되거나 종료된 Room에는 새 후보를 등록할 수 없습니다.
        </p>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-slate-800">
              표시 순서
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                min="1"
                onChange={(event) => setDisplayOrder(event.target.value)}
                type="number"
                value={displayOrder}
              />
              {fieldErrors.displayOrder && (
                <span className="block text-xs font-normal text-rose-600">
                  {fieldErrors.displayOrder}
                </span>
              )}
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-800">
              시간대
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                onChange={(event) => setTimezone(event.target.value)}
                value={timezone}
              />
              {fieldErrors.timezone && (
                <span className="block text-xs font-normal text-rose-600">
                  {fieldErrors.timezone}
                </span>
              )}
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-slate-800">
              시작 시간
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                onChange={(event) => setStartsAt(event.target.value)}
                type="datetime-local"
                value={startsAt}
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-800">
              종료 시간
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                onChange={(event) => setEndsAt(event.target.value)}
                type="datetime-local"
                value={endsAt}
              />
            </label>
          </div>
          {fieldErrors.time && (
            <p className="-mt-3 text-xs text-rose-600">{fieldErrors.time}</p>
          )}

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
