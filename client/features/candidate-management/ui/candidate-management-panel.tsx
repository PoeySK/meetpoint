"use client";

import { useState, type FormEvent } from "react";
import { createCandidate } from "@/entities/candidate/api/candidate-api";
import type {
  Candidate,
  CreateCandidateInput,
} from "@/entities/candidate/model/types";
import type { RoomDetailsResponse } from "@/entities/room/model/types";
import { RoomApiError } from "@/shared/api/http-client";
import { MEETPOINT_TIMEZONE } from "@/shared/config/meetpoint";
import {
  buildKstDateTime,
  getKstDateValue,
  parseDateValue,
} from "@/features/candidate-management/ui/candidate-date-picker";
import {
  CandidateForm,
  type CandidateFieldErrors,
} from "@/features/candidate-management/ui/candidate-form";

type CandidateManagementPanelProps = {
  roomId: string;
  token: string;
  participantId: string;
  room: RoomDetailsResponse;
  onCandidateCreated: (candidate: Candidate) => void;
};

function parseTimeValue(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function validateCandidateForm(
  date: string,
  startTime: string,
  endTime: string,
  placeName: string,
  address: string,
  area: string,
  cost: string,
  tags: string,
) {
  const errors: CandidateFieldErrors = {};
  const parsedStartTime = parseTimeValue(startTime);
  const parsedEndTime = parseTimeValue(endTime);
  const parsedCost = Number(cost);

  if (!parseDateValue(date)) {
    errors.date = "모임 날짜를 선택해 주세요.";
  }

  if (parsedStartTime === null || parsedEndTime === null) {
    errors.time = "시작 시간과 종료 시간을 입력해 주세요.";
  } else if (parsedEndTime <= parsedStartTime) {
    errors.time = "종료 시간은 시작 시간보다 늦어야 합니다.";
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
    errors.cost = "1인 예상 비용은 0~2,000,000원 정수로 입력해 주세요.";
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
      return "호스트만 후보를 등록할 수 있습니다.";
    }
    if (error.code === "ROOM_STATE_CONFLICT") {
      return "현재 방 상태에서는 후보를 등록할 수 없습니다.";
    }
    if (error.code === "VALIDATION_ERROR") {
      return "후보 입력을 다시 확인해 주세요.";
    }
  }

  return "후보를 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function CandidateManagementPanel({
  roomId,
  token,
  participantId,
  room,
  onCandidateCreated,
}: CandidateManagementPanelProps) {
  const isHost = participantId === room.room.hostParticipantId;
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [cost, setCost] = useState("");
  const [tags, setTags] = useState("");
  const [fieldErrors, setFieldErrors] = useState<CandidateFieldErrors>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isHost) {
    return null;
  }

  const isRoomClosed =
    room.room.status === "CONFIRMED" || room.room.status === "CLOSED";
  const hasReachedCandidateLimit = room.candidates.length >= 5;
  const nextCandidateNumber = room.candidates.length + 1;

  function clearCandidateForm() {
    setDate("");
    setStartTime("");
    setEndTime("");
    setPlaceName("");
    setAddress("");
    setArea("");
    setCost("");
    setTags("");
    setFieldErrors({});
    setFormError("");
  }

  function fillExample() {
    setDate(getKstDateValue(1));
    setStartTime("19:00");
    setEndTime("21:00");
    setPlaceName("강남역 조용한 식당");
    setAddress("서울 강남구 테헤란로 1");
    setArea("강남");
    setCost("28000");
    setTags("조용함, 야외");
    setFieldErrors({});
    setFormError("");
  }

  function applyTimePreset(start: string, end: string) {
    setStartTime(start);
    setEndTime(end);
    setFieldErrors((current) => ({ ...current, time: undefined }));
  }

  function applyDate(value: string) {
    setDate(value);
    setFieldErrors((current) => ({ ...current, date: undefined }));
  }

  function applyTimeChange(
    setter: (value: string) => void,
    value: string,
  ) {
    setter(value);
    setFieldErrors((current) => ({ ...current, time: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateCandidateForm(
      date,
      startTime,
      endTime,
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
      displayOrder: nextCandidateNumber,
      time: {
        startsAt: buildKstDateTime(date, startTime),
        endsAt: buildKstDateTime(date, endTime),
        timezone: MEETPOINT_TIMEZONE,
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
      clearCandidateForm();
    } catch (error) {
      setFormError(describeCandidateError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-emerald-100 bg-emerald-50/60 p-5 sm:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-emerald-700">호스트</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
            장소 후보 등록
          </h2>
          <p className="text-sm leading-6 text-slate-600">
            참여자들의 비교를 위해 시간과 장소를 최대 5개까지 등록할 수 있습니다.
          </p>
        </div>
        <span className="w-fit rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-slate-600">
          {room.candidates.length} / 5개
        </span>
      </div>

      <div className="mb-5 rounded-2xl border border-emerald-100 bg-white/80 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">빠른 입력</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              예시를 채워 입력 방법을 확인하거나 테스트용 시간을 준비할 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              onClick={fillExample}
              disabled={isRoomClosed || isSubmitting}
              type="button"
            >
              예시로 채우기
            </button>
            <button
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-500 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              onClick={clearCandidateForm}
              disabled={isRoomClosed || isSubmitting}
              type="button"
            >
              입력 지우기
            </button>
          </div>
        </div>
      </div>

      {isRoomClosed ? (
        <p className="rounded-xl bg-white px-4 py-3 text-sm leading-6 text-slate-600">
          확정되거나 종료된 방에서는 후보를 등록할 수 없습니다.
        </p>
      ) : hasReachedCandidateLimit ? (
        <p className="rounded-xl bg-white px-4 py-3 text-sm leading-6 text-slate-600">
          활성 후보 5개가 등록되어 더 추가할 수 없습니다.
        </p>
      ) : (
        <CandidateForm
          address={address}
          area={area}
          cost={cost}
          date={date}
          endTime={endTime}
          fieldErrors={fieldErrors}
          formError={formError}
          isSubmitting={isSubmitting}
          nextCandidateNumber={nextCandidateNumber}
          onAddressChange={setAddress}
          onAreaChange={setArea}
          onCostChange={setCost}
          onDateChange={applyDate}
          onEndTimeChange={(value) => applyTimeChange(setEndTime, value)}
          onPlaceNameChange={setPlaceName}
          onStartTimeChange={(value) => applyTimeChange(setStartTime, value)}
          onSubmit={handleSubmit}
          onTagsChange={setTags}
          onTimePreset={applyTimePreset}
          placeName={placeName}
          startTime={startTime}
          tags={tags}
        />
      )}
    </section>
  );
}
