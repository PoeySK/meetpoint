"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom } from "@/entities/room";
import { RoomApiError } from "@/shared/api/http-client";
import { MEETPOINT_TIMEZONE } from "@/shared/config/meetpoint";
import {
  getRoomRecoveryStorageKey,
  getRoomParticipantStorageKey,
  getRoomTokenStorageKey,
  rememberRoomAddress,
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
      const form = event.currentTarget;
      window.requestAnimationFrame(() => form.querySelector<HTMLInputElement>(errors.title ? '#title' : '#displayName')?.focus());
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

      try { window.sessionStorage.setItem(getRoomRecoveryStorageKey(response.room.id), JSON.stringify(response.recovery)); } catch { /* 복구 쿠키는 계속 사용할 수 있다. */ }
      rememberRoomAddress(response.room.roomCode, response.room.id);
      router.push(`/rooms/${encodeURIComponent(response.room.id)}`);
    } catch (error) {
      if (error instanceof RoomApiError && error.status === 429) {
        setFormError(error.message);
      } else if (error instanceof RoomApiError && error.status === 400) {
        setFormError("입력 내용을 확인해 주세요.");
      } else {
        setFormError("방을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="p-4 sm:p-6">
      <div className="mb-5 pr-12">
        <h2 className="break-keep text-2xl font-extrabold tracking-tight" id="create-room-heading">약속 방 만들기</h2>
        <p className="mt-1 text-sm leading-5 text-[var(--mp-muted)]">만날 시간과 장소를 같이 정해요.</p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-1.5">
          <label className="text-sm font-semibold text-slate-800" htmlFor="title">
            모임 제목
          </label>
          <input
            aria-describedby={fieldErrors.title ? "title-error" : undefined}
            aria-invalid={Boolean(fieldErrors.title)}
            className="mp-input min-h-11 rounded-lg text-base aria-invalid:border-rose-600"
            id="title"
            maxLength={80}
            onChange={(event) => {
              setTitle(event.target.value);
              if (fieldErrors.title) setFieldErrors((errors) => ({ ...errors, title: undefined }));
            }}
            placeholder="예: 우리 동네 저녁 모임"
            required
            value={title}
          />
          {fieldErrors.title && (
            <p className="text-sm text-rose-600" id="title-error">
              {fieldErrors.title}
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <label
            className="text-sm font-semibold text-slate-800"
            htmlFor="displayName"
          >
            방장 이름
          </label>
          <input
            aria-describedby={
              fieldErrors.displayName ? "display-name-error create-name-hint" : "create-name-hint"
            }
            aria-invalid={Boolean(fieldErrors.displayName)}
            autoComplete="nickname"
            className="mp-input min-h-11 rounded-lg text-base aria-invalid:border-rose-600"
            id="displayName"
            maxLength={30}
            onChange={(event) => {
              setDisplayName(event.target.value);
              if (fieldErrors.displayName) setFieldErrors((errors) => ({ ...errors, displayName: undefined }));
            }}
            placeholder="예: 민수"
            required
            value={displayName}
          />
          {fieldErrors.displayName && (
            <p className="text-sm text-rose-600" id="display-name-error">
              {fieldErrors.displayName}
            </p>
          )}
          <p className="text-xs leading-5 text-slate-600" id="create-name-hint">참가자에게 보이는 이름이에요.</p>
        </div>

        {formError && (
          <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-700" role="alert">
            {formError}
          </p>
        )}

        <button
          className="mp-button mp-button-primary min-h-11 w-full"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "약속 방을 만드는 중..." : "방 만들기"}
        </button>
      </form>
      <details className="group mt-2 border-t border-stone-200">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-sm font-semibold text-stone-700 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700 [&::-webkit-details-marker]:hidden">
          <span>방을 만든 뒤엔?</span>
          <span aria-hidden="true" className="transition-transform group-open:rotate-180 motion-reduce:transition-none">⌄</span>
        </summary>
        <p className="pb-2 break-keep text-sm leading-6 text-stone-600">
          시간과 장소 후보를 올리고 친구들에게 링크를 보내요. 모인 의견을 보고 약속을 정해요.
        </p>
      </details>
    </section>
  );
}
