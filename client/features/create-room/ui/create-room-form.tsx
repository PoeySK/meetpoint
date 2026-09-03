"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createRoom } from "@/entities/room";
import { RoomApiError } from "@/shared/api/http-client";
import { MEETPOINT_TIMEZONE } from "@/shared/config/meetpoint";
import {
  getRoomParticipantStorageKey,
  getRoomTokenStorageKey,
} from "@/shared/lib/room-session";

type FieldErrors = {
  title?: string;
  displayName?: string;
};

function validateForm(title: string, displayName: string) {
  const errors: FieldErrors = {};

  if (!title.trim()) {
    errors.title = "모임 제목을 입력해 주세요.";
  } else if (title.trim().length > 80) {
    errors.title = "모임 제목은 80자 이하로 입력해 주세요.";
  }

  if (!displayName.trim()) {
    errors.displayName = "방장 이름을 입력해 주세요.";
  } else if (displayName.trim().length > 30) {
    errors.displayName = "방장 이름은 30자 이하로 입력해 주세요.";
  }

  return errors;
}

export function CreateRoomForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedTitle = title.trim();
    const normalizedDisplayName = displayName.trim();
    const errors = validateForm(normalizedTitle, normalizedDisplayName);

    setFieldErrors(errors);
    setFormError("");

    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await createRoom({
        title: normalizedTitle,
        timezone: MEETPOINT_TIMEZONE,
        host: {
          displayName: normalizedDisplayName,
        },
      });

      try {
        window.sessionStorage.setItem(
          getRoomTokenStorageKey(response.room.id),
          response.access.hostToken,
        );
        window.sessionStorage.setItem(
          getRoomParticipantStorageKey(response.room.id),
          response.hostParticipant.id,
        );
      } catch {
        setFormError(
          "이 브라우저에 입장 정보를 저장할 수 없습니다. 브라우저 설정을 확인하고 다시 시도해 주세요.",
        );
        return;
      }

      router.push(`/rooms/${encodeURIComponent(response.room.id)}`);
    } catch (error) {
      if (error instanceof RoomApiError && error.status === 400) {
        setFormError("입력 내용을 확인해 주세요.");
      } else {
        setFormError("방을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mp-card mp-card-raised p-4 sm:p-6">
      <div className="mb-5 space-y-1.5">
        <p className="text-sm font-semibold text-emerald-700">새 방</p>
        <h2 className="text-xl font-semibold tracking-tight">모임 정보 입력</h2>
        <p className="text-sm leading-6 text-slate-500">
          방을 만든 사람이 자동으로 방장이 됩니다.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-800" htmlFor="title">
            모임 제목
          </label>
          <input
            aria-describedby={fieldErrors.title ? "title-error" : undefined}
            aria-invalid={Boolean(fieldErrors.title)}
            className="mp-input"
            id="title"
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예: 우리 동네 저녁 모임"
            value={title}
          />
          {fieldErrors.title && (
            <p className="text-sm text-rose-600" id="title-error">
              {fieldErrors.title}
            </p>
          )}
        </div>

        <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-xs leading-5 text-emerald-800">
          모든 시간은 한국 시간으로 입력하고 표시합니다.
        </p>

        <div className="space-y-2">
          <label
            className="text-sm font-semibold text-slate-800"
            htmlFor="displayName"
          >
            방장 이름
          </label>
          <input
            aria-describedby={
              fieldErrors.displayName ? "display-name-error" : undefined
            }
            aria-invalid={Boolean(fieldErrors.displayName)}
            autoComplete="nickname"
            className="mp-input"
            id="displayName"
            maxLength={30}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="예: 민수"
            value={displayName}
          />
          {fieldErrors.displayName && (
            <p className="text-sm text-rose-600" id="display-name-error">
              {fieldErrors.displayName}
            </p>
          )}
        </div>

        {formError && (
          <p
            aria-live="polite"
            className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-700"
          >
            {formError}
          </p>
        )}

        <button
          className="mp-button mp-button-primary flex w-full items-center justify-center"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "방을 만드는 중..." : "방 만들기"}
        </button>
        <p className="text-center text-xs leading-5 text-slate-400">
          방장 입장 정보는 이 브라우저에만 저장됩니다.
        </p>
        <p className="text-center text-sm text-slate-500">
          초대받은 참가자라면?{" "}
          <Link
            className="font-semibold text-emerald-700 hover:text-emerald-800"
            href="/join"
          >
            방 코드로 입장하기
          </Link>
        </p>
      </form>
    </section>
  );
}
