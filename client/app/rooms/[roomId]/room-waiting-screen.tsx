"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CandidateManagementPanel } from "@/features/candidate-management/ui/candidate-management-panel";
import { ParticipantResponsePanel } from "@/features/participant-response/ui/participant-response-panel";
import {
  getRoom,
  getRoomParticipantStorageKey,
  getRoomTokenStorageKey,
  RoomApiError,
  type RoomDetailsResponse,
  type RoomStatus,
} from "@/lib/rooms";

type RoomLoadError = {
  title: string;
  message: string;
};

const statusLabels: Record<RoomStatus, string> = {
  DRAFT: "준비 중",
  OPEN: "참여 가능",
  CALCULATING: "계산 중",
  CALCULATED: "계산 완료",
  CONFIRMED: "확정됨",
  CLOSED: "종료됨",
};

function describeRoomError(error: unknown): RoomLoadError {
  if (error instanceof RoomApiError) {
    if (error.code === "TOKEN_EXPIRED") {
      return {
        title: "접근 토큰이 만료되었습니다.",
        message: "방 코드로 다시 입장해 주세요.",
      };
    }

    if (error.code === "INVALID_TOKEN") {
      return {
        title: "접근 토큰을 확인할 수 없습니다.",
        message: "방 코드와 이름을 입력해 다시 입장해 주세요.",
      };
    }

    if (error.status === 404) {
      return {
        title: "방을 찾을 수 없습니다.",
        message: "주소를 확인하거나 방 코드로 다시 입장해 주세요.",
      };
    }

    return {
      title: "방 정보를 불러오지 못했습니다.",
      message: "잠시 후 다시 시도해 주세요.",
    };
  }

  return {
    title: "서버에 연결할 수 없습니다.",
    message: "네트워크 연결과 API 서버 상태를 확인한 뒤 다시 시도해 주세요.",
  };
}

function LoadingView() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-center shadow-sm">
        <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
        <p className="text-sm font-medium text-slate-600">방 정보를 불러오는 중...</p>
      </div>
    </div>
  );
}

function ErrorView({
  error,
  onRetry,
}: {
  error: RoomLoadError;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center justify-center">
      <section
        aria-live="polite"
        className="w-full rounded-[2rem] border border-rose-100 bg-white p-6 text-center shadow-xl shadow-slate-200/50 sm:p-10"
      >
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-xl text-rose-600">
          !
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          {error.title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">{error.message}</p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200"
            onClick={onRetry}
            type="button"
          >
            다시 시도
          </button>
          <Link
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
            href="/join"
          >
            방 코드로 다시 입장
          </Link>
        </div>
      </section>
    </div>
  );
}

function RoomSummary({ room }: { room: RoomDetailsResponse }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(room.room.roomCode);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <>
      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/50 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
              {statusLabels[room.room.status]}
            </span>
            <div>
              <p className="text-sm font-semibold text-emerald-700">Room waiting</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                {room.room.title}
              </h1>
            </div>
            <p className="text-sm text-slate-500">{room.room.timezone}</p>
          </div>

          <div className="rounded-2xl bg-slate-950 p-4 text-white sm:min-w-44 sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Room code
            </p>
            <p className="mt-1 text-3xl font-bold tracking-[0.18em]">
              {room.room.roomCode}
            </p>
            <button
              className="mt-3 rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              onClick={copyRoomCode}
              type="button"
            >
              {copyState === "copied" ? "복사됨" : "코드 복사"}
            </button>
          </div>
        </div>
        {copyState === "failed" && (
          <p className="mt-4 text-sm text-rose-600">
            코드를 자동으로 복사하지 못했습니다. 코드를 직접 선택해 복사해 주세요.
          </p>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">호스트</p>
          <p className="mt-2 font-semibold text-slate-950">
            {room.hostParticipant.displayName}
          </p>
          <p className="mt-1 text-xs text-emerald-700">HOST</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">참여자</p>
          <p className="mt-2 font-semibold text-slate-950">
            {room.participants.length}명
          </p>
          <p className="mt-1 text-xs text-slate-500">
            최대 {room.room.maxParticipants}명
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">현재 단계</p>
          <p className="mt-2 font-semibold text-slate-950">참여자 기다리는 중</p>
          <p className="mt-1 text-xs text-slate-500">아직 계산 전입니다</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6">
          <p className="text-sm font-semibold text-slate-950">후보 장소</p>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {room.candidates.length === 0
              ? "아직 등록된 후보가 없습니다. 참여자와 후보를 준비하면 이곳에 표시됩니다."
              : `${room.candidates.length}개의 후보가 등록되어 있습니다.`}
          </p>
        </div>
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6">
          <p className="text-sm font-semibold text-slate-950">계산 결과</p>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {room.latestScoreResult === null
              ? "아직 계산 결과가 없습니다. 모든 준비가 끝나면 결과가 여기에 표시됩니다."
              : "최신 계산 결과를 확인할 수 있습니다."}
          </p>
        </div>
      </section>
    </>
  );
}

export default function RoomWaitingScreen({ roomId }: { roomId: string }) {
  const [room, setRoom] = useState<RoomDetailsResponse | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [error, setError] = useState<RoomLoadError | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadRoom = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setRoom(null);
    setAccessToken(null);
    setParticipantId(null);

    let token: string | null = null;
    let storedParticipantId: string | null = null;
    try {
      token = window.sessionStorage.getItem(getRoomTokenStorageKey(roomId));
      storedParticipantId = window.sessionStorage.getItem(
        getRoomParticipantStorageKey(roomId),
      );
    } catch {
      setError({
        title: "브라우저 저장소에 접근할 수 없습니다.",
        message: "세션 저장소를 사용할 수 있는 브라우저에서 다시 시도해 주세요.",
      });
      setIsLoading(false);
      return;
    }

    if (!token) {
      setError({
        title: "이 방에 접근할 토큰이 없습니다.",
        message: "방 코드와 이름을 입력해 다시 입장해 주세요.",
      });
      setIsLoading(false);
      return;
    }

    try {
      const response = await getRoom(roomId, token);
      setRoom(response);
      setAccessToken(token);
      setParticipantId(storedParticipantId);
    } catch (requestError) {
      setError(describeRoomError(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadRoom();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadRoom]);

  return (
    <main className="min-h-screen bg-[#f6f7f3] px-4 py-8 font-sans text-slate-950 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link className="text-lg font-bold tracking-tight" href="/">
            MeetPoint
          </Link>
          <span className="text-xs font-medium text-slate-400">ROOM WAITING</span>
        </div>

        {isLoading && <LoadingView />}
        {!isLoading && error && (
          <ErrorView error={error} onRetry={() => void loadRoom()} />
        )}
        {!isLoading && !error && room && (
          <div className="space-y-5">
            <RoomSummary room={room} />
            {accessToken && participantId ? (
              <>
                <CandidateManagementPanel
                  onCandidateCreated={(candidate) =>
                    setRoom((currentRoom) =>
                      currentRoom
                        ? {
                            ...currentRoom,
                            candidates: [...currentRoom.candidates, candidate].sort(
                              (left, right) =>
                                left.displayOrder - right.displayOrder,
                            ),
                          }
                        : currentRoom,
                    )
                  }
                  participantId={participantId}
                  room={room}
                  roomId={roomId}
                  token={accessToken}
                />
                <ParticipantResponsePanel
                  candidates={room.candidates}
                  participantId={participantId}
                  roomId={roomId}
                  token={accessToken}
                />
              </>
            ) : (
              <section className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-sm leading-6 text-amber-800">
                이 브라우저에서 참여자 정보를 찾을 수 없어 후보 등록과 응답을 사용할 수
                없습니다. Room code로 다시 입장하면 계속할 수 있습니다.
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
