"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createRoom,
  getRoomTokenStorageKey,
  RoomApiError,
} from "@/lib/rooms";

type FieldErrors = {
  title?: string;
  timezone?: string;
  displayName?: string;
};

const DEFAULT_TIMEZONE = "Asia/Seoul";

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function validateForm(title: string, timezone: string, displayName: string) {
  const errors: FieldErrors = {};

  if (!title.trim()) {
    errors.title = "모임 제목을 입력해 주세요.";
  } else if (title.trim().length > 80) {
    errors.title = "모임 제목은 80자 이하로 입력해 주세요.";
  }

  if (!timezone.trim() || !isValidTimezone(timezone.trim())) {
    errors.timezone = "올바른 IANA 시간대를 입력해 주세요. 예: Asia/Seoul";
  }

  if (!displayName.trim()) {
    errors.displayName = "호스트 이름을 입력해 주세요.";
  } else if (displayName.trim().length > 30) {
    errors.displayName = "호스트 이름은 30자 이하로 입력해 주세요.";
  }

  return errors;
}

export default function Home() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [displayName, setDisplayName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedTitle = title.trim();
    const normalizedTimezone = timezone.trim();
    const normalizedDisplayName = displayName.trim();
    const errors = validateForm(
      normalizedTitle,
      normalizedTimezone,
      normalizedDisplayName,
    );

    setFieldErrors(errors);
    setFormError("");

    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await createRoom({
        title: normalizedTitle,
        timezone: normalizedTimezone,
        host: {
          displayName: normalizedDisplayName,
        },
      });

      try {
        window.sessionStorage.setItem(
          getRoomTokenStorageKey(response.room.id),
          response.access.hostToken,
        );
      } catch {
        setFormError(
          "이 브라우저에서 세션 저장소를 사용할 수 없습니다. 저장소 설정을 확인한 뒤 다시 시도해 주세요.",
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
    <main className="min-h-screen bg-[#f6f7f3] px-4 py-8 font-sans text-slate-950 sm:px-6 sm:py-12">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="space-y-6 px-1 sm:px-4 lg:pr-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            MeetPoint
          </div>
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Make the first move
            </p>
            <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
              모임의 시작점을
              <br />
              가볍게 만들어 보세요.
            </h1>
            <p className="max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              방을 만들고 초대 링크를 공유하면, 모두의 시간과 장소를 함께 맞춰갈 수
              있습니다.
            </p>
          </div>
          <div className="grid max-w-xl gap-3 text-sm text-slate-600 sm:grid-cols-3">
            <p className="rounded-2xl border border-slate-200 bg-white/70 p-4">
              <span className="mb-1 block font-semibold text-slate-950">01</span>
              방 만들기
            </p>
            <p className="rounded-2xl border border-slate-200 bg-white/70 p-4">
              <span className="mb-1 block font-semibold text-slate-950">02</span>
              초대하기
            </p>
            <p className="rounded-2xl border border-slate-200 bg-white/70 p-4">
              <span className="mb-1 block font-semibold text-slate-950">03</span>
              함께 기다리기
            </p>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/50 sm:p-8">
          <div className="mb-8 space-y-2">
            <p className="text-sm font-semibold text-emerald-700">새 Room</p>
            <h2 className="text-2xl font-semibold tracking-tight">모임 정보 입력</h2>
            <p className="text-sm leading-6 text-slate-500">
              방을 만든 사람은 자동으로 HOST가 됩니다.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-800" htmlFor="title">
                모임 제목
              </label>
              <input
                aria-describedby={fieldErrors.title ? "title-error" : undefined}
                aria-invalid={Boolean(fieldErrors.title)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                id="title"
                maxLength={80}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="예: 여름 저녁 모임"
                value={title}
              />
              {fieldErrors.title && (
                <p className="text-sm text-rose-600" id="title-error">
                  {fieldErrors.title}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-semibold text-slate-800"
                htmlFor="timezone"
              >
                시간대
              </label>
              <input
                aria-describedby={
                  fieldErrors.timezone ? "timezone-error" : undefined
                }
                aria-invalid={Boolean(fieldErrors.timezone)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                id="timezone"
                onChange={(event) => setTimezone(event.target.value)}
                placeholder="Asia/Seoul"
                value={timezone}
              />
              {fieldErrors.timezone && (
                <p className="text-sm text-rose-600" id="timezone-error">
                  {fieldErrors.timezone}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-semibold text-slate-800"
                htmlFor="displayName"
              >
                호스트 이름
              </label>
              <input
                aria-describedby={
                  fieldErrors.displayName ? "display-name-error" : undefined
                }
                aria-invalid={Boolean(fieldErrors.displayName)}
                autoComplete="nickname"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
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
                className="rounded-xl bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700"
              >
                {formError}
              </p>
            )}

            <button
              className="flex w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-3.5 text-base font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "방을 만드는 중..." : "방 만들기"}
            </button>
            <p className="text-center text-xs leading-5 text-slate-400">
              호스트 접근 토큰은 이 브라우저의 sessionStorage에만 보관됩니다.
            </p>
            <p className="text-center text-sm text-slate-500">
              초대받은 참가자라면{" "}
              <Link className="font-semibold text-emerald-700 hover:text-emerald-800" href="/join">
                방 코드로 입장하기
              </Link>
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
